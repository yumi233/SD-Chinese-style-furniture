const fs = require("fs");
const { setTimeout: sleep } = require("node:timers/promises");
const path = require("path");
const { randomUUID } = require("node:crypto");
const { toDataUrl } = require("../utils");
const { dispatchModelRequest } = require("./dispatch");
const { PRODUCT_PHOTO_DIRECTION } = require("../lib/designDirection");

class ComfyUiAdapter {
  constructor(config) {
    this.baseUrl = config.baseUrl.replace(/\/$/, "");
    this.checkpoint = config.checkpoint || "model.safetensors";
    this.workflowFile = config.workflowFile;
    this.strictNegativeValidation = config.strictNegativeValidation === true;
  }

  async health() {
    const response = await fetch(`${this.baseUrl}/system_stats`);
    if (!response.ok) {
      throw new Error(`ComfyUI health check failed: ${response.status}`);
    }
    return {
      ok: true,
      baseUrl: this.baseUrl,
    };
  }

  preflight({ request, settings }) {
    if (!this.workflowFile) return;
    const template = fs.readFileSync(path.resolve(this.workflowFile), "utf8");
    const { canEnhancePrompt } = this.buildWorkflow(request, settings, template);
    return { template, canEnhancePrompt };
  }

  buildWorkflow(request, settings, template) {
    const { width, height, steps, cfgScale, samplerName, scheduler, seed } = settings;
    const variables = {
      prompt: request.prompt, negativePrompt: request.negativePrompt,
      width, height, steps, cfgScale, samplerName, scheduler, seed, checkpoint: this.checkpoint,
    };
    const loaded = template == null
      ? {
          negativeVerified: true, whiteBackdropVerified: true,
          workflow: buildDefaultWorkflow({ ...variables, prompt: withWhiteBackdrop(variables.prompt) }),
          canEnhancePrompt: true, finalPrompt: withWhiteBackdrop(variables.prompt),
        }
      : loadWorkflowTemplate(template, {
          ...variables, prompt: request.templatePrompt ?? request.prompt,
          negativePrompt: request.userNegativePrompt ?? request.negativePrompt,
        }, request.prompt, request.defaultNegativePrompt);
    if (!loaded.negativeVerified && this.strictNegativeValidation) {
      const error = new Error("ComfyUI workflow has unverified negative conditioning.");
      error.statusCode = 400;
      throw error;
    }
    return loaded;
  }

  async generate({ request, settings, signal, onDispatch, prepared }) {
    const template = prepared?.template ?? (this.workflowFile ? fs.readFileSync(path.resolve(this.workflowFile), "utf8") : null);
    const loaded = this.buildWorkflow(request, settings, template);
    const warnings = [];
    if (!loaded.negativeVerified) warnings.push({ code: "COMFYUI_NEGATIVE_UNVERIFIED", message: "反向词未验证" });
    if (!loaded.whiteBackdropVerified) warnings.push({ code: "COMFYUI_WHITE_BACKDROP_UNVERIFIED", message: "白底未验证" });
    const reportedWarnings = warnings.length ? { warning: warnings[0], warnings } : {};

    const enqueueResponse = await dispatchModelRequest(`${this.baseUrl}/prompt`, {
      method: "POST",
      signal,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ prompt: loaded.workflow }),
    }, onDispatch);

    if (!enqueueResponse.ok) {
      const text = await enqueueResponse.text();
      const error = new Error(`ComfyUI prompt enqueue failed: ${enqueueResponse.status}`);
      error.statusCode = enqueueResponse.status;
      error.details = text;
      throw error;
    }

    const enqueueJson = await enqueueResponse.json();
    const promptId = enqueueJson.prompt_id;
    const history = await waitForHistory(this.baseUrl, promptId, signal);
    const imageRef = pickFirstImage(history);

    if (!imageRef) {
      throw new Error("ComfyUI finished without image output.");
    }

    const imageResponse = await fetch(
      `${this.baseUrl}/view?filename=${encodeURIComponent(imageRef.filename)}&subfolder=${encodeURIComponent(
        imageRef.subfolder || "",
      )}&type=${encodeURIComponent(imageRef.type || "output")}`,
      { signal },
    );

    if (!imageResponse.ok) {
      throw new Error(`ComfyUI image fetch failed: ${imageResponse.status}`);
    }

    const arrayBuffer = await imageResponse.arrayBuffer();
    return {
      images: [
        {
          mimeType: "image/png",
          url: toDataUrl(Buffer.from(arrayBuffer), "image/png"),
          prompt: loaded.finalPrompt,
          ...reportedWarnings,
        },
      ],
      metadata: {
        promptId,
        whiteBackdropVerified: loaded.whiteBackdropVerified,
        finalPrompt: loaded.finalPrompt,
        ...reportedWarnings,
      },
    };
  }
}

async function waitForHistory(baseUrl, promptId, signal) {
  const startedAt = Date.now();
  const timeoutMs = 120000;

  while (Date.now() - startedAt < timeoutMs) {
    const response = await fetch(`${baseUrl}/history/${promptId}`, { signal });
    if (!response.ok) {
      await sleep(1000, undefined, { signal });
      continue;
    }

    const json = await response.json();
    if (json[promptId] && json[promptId].outputs) {
      return json[promptId];
    }

    await sleep(1000, undefined, { signal });
  }

  throw new Error("Timed out waiting for ComfyUI history.");
}

function pickFirstImage(history) {
  const outputs = Object.values(history.outputs || {});
  for (const output of outputs) {
    const images = output.images || [];
    if (images.length > 0) {
      return images[0];
    }
  }
  return null;
}

function buildDefaultWorkflow({
  prompt,
  negativePrompt,
  width,
  height,
  steps,
  cfgScale,
  samplerName,
  scheduler,
  seed,
  checkpoint,
}) {
  return {
    "1": {
      inputs: {
        ckpt_name: checkpoint,
      },
      class_type: "CheckpointLoaderSimple",
    },
    "2": {
      inputs: {
        text: prompt,
        clip: ["1", 1],
      },
      class_type: "CLIPTextEncode",
    },
    "3": {
      inputs: {
        text: negativePrompt,
        clip: ["1", 1],
      },
      class_type: "CLIPTextEncode",
    },
    "4": {
      inputs: {
        width,
        height,
        batch_size: 1,
      },
      class_type: "EmptyLatentImage",
    },
    "5": {
      inputs: {
        seed,
        steps,
        cfg: cfgScale,
        sampler_name: samplerName,
        scheduler,
        denoise: 1,
        model: ["1", 0],
        positive: ["2", 0],
        negative: ["3", 0],
        latent_image: ["4", 0],
      },
      class_type: "KSampler",
    },
    "6": {
      inputs: {
        samples: ["5", 0],
        vae: ["1", 2],
      },
      class_type: "VAEDecode",
    },
    "7": {
      inputs: {
        filename_prefix: "huazuo",
        images: ["6", 0],
      },
      class_type: "SaveImage",
    },
  };
}

function hydrateWorkflow(template, variables) {
  const hydrated = template.replace(/"(?:[^"\\]|\\.)*"|\{\{(\w+)\}\}/g, (token, key) => {
    if (key) return JSON.stringify(variables[key] ?? "");
    if (!token.includes("{{")) return token;
    return JSON.stringify(JSON.parse(token).replace(/\{\{(\w+)\}\}/g, (_, name) => String(variables[name] ?? "")));
  });
  return JSON.parse(hydrated);
}

function withWhiteBackdrop(text = "") {
  if (text.includes(PRODUCT_PHOTO_DIRECTION)) return text;
  return [text, "The following product presentation overrides any conflicting background or prop instructions.", PRODUCT_PHOTO_DIRECTION].filter(Boolean).join("\n");
}

const DIRECT_SAMPLERS = ["KSampler", "KSamplerAdvanced", "SamplerCustom"];

function loadWorkflowTemplate(template, variables, positivePrompt, defaults = "") {
  const workflow = hydrateWorkflow(template, variables);
  const samplers = Object.values(workflow).filter(node =>
    DIRECT_SAMPLERS.includes(node?.class_type) ||
    (/sampler/i.test(node?.class_type) && ["negative", "guider", "latent_image"].some(key => Object.hasOwn(node.inputs || {}, key))));
  const negativeVerified = applyConditioning(workflow, samplers, "negative", text => {
    const additions = [defaults, variables.negativePrompt].filter(value => value && !text.includes(value));
    return additions.length ? [...additions, text.trim()].filter(Boolean).join(", ") : text;
  });
  const marker = randomUUID();
  const authored = hydrateWorkflow(template, { ...variables, prompt: marker });
  const roots = positiveRoots(workflow, samplers);
  const promptFields = applyAuthoredPrompts(workflow, roots, authored, marker, positivePrompt);
  const whiteBackdropVerified = applyConditioning(workflow, samplers, "positive", withWhiteBackdrop);
  const finalPrompt = collectPositiveText(workflow, roots, promptFields);
  return { workflow, negativeVerified, whiteBackdropVerified, canEnhancePrompt: promptFields.size > 0, finalPrompt };
}

function linkedNode(workflow, link) {
  if (!Array.isArray(link) || link.length !== 2 || !Number.isInteger(link[1])) return;
  const id = String(link[0]);
  return Object.hasOwn(workflow, id) ? id : undefined;
}

const POSITIVE_INPUTS = new Map([
  ["CLIPTextEncode", ["text"]],
  ["CLIPTextEncodeSDXL", ["text_g", "text_l"]],
  ["PrimitiveString", ["value"]],
  ["ConditioningSetArea", ["conditioning"]],
  ["ConditioningSetAreaPercentage", ["conditioning"]],
  ["ConditioningSetMask", ["conditioning"]],
  ["ConditioningSetTimestepRange", ["conditioning"]],
  ["ConditioningZeroOut", ["conditioning"]],
  ["ConditioningCombine", ["conditioning_1", "conditioning_2"]],
  ["ConditioningConcat", ["conditioning_to", "conditioning_from"]],
  ["ConditioningAverage", ["conditioning_to", "conditioning_from"]],
  ["ControlNetApplyAdvanced", ["positive"]],
]);

function positiveInputNames(node, output) {
  // ControlNet output 1 is negative conditioning. Unknown output ports and nodes are opaque.
  return output === 0 ? POSITIVE_INPUTS.get(node?.class_type) || [] : [];
}

function positiveRoots(workflow, samplers) {
  return samplers.flatMap(sampler => {
    if (DIRECT_SAMPLERS.includes(sampler.class_type)) return [[sampler.inputs, "positive"]];
    if (sampler.class_type !== "SamplerCustomAdvanced") return [];
    const link = sampler.inputs?.guider;
    if (link?.[1] !== 0) return [];
    const guider = workflow[linkedNode(workflow, link)];
    if (guider?.class_type === "CFGGuider") return [[guider.inputs, "positive"]];
    if (guider?.class_type === "BasicGuider") return [[guider.inputs, "conditioning"]];
    return [];
  }).filter(([inputs, key]) => linkedNode(workflow, inputs?.[key]) !== undefined);
}

function countConsumers(workflow) {
  const consumers = new Map();
  for (const node of Object.values(workflow)) {
    for (const link of Object.values(node?.inputs || {})) {
      const id = linkedNode(workflow, link);
      if (id !== undefined) consumers.set(id, (consumers.get(id) || 0) + 1);
    }
  }
  return consumers;
}

function cloneNode(workflow, node) {
  let id = 1;
  while (Object.hasOwn(workflow, String(id))) id++;
  workflow[id] = node;
  return String(id);
}

function applyAuthoredPrompts(workflow, roots, authored, marker, prompt) {
  const consumers = countConsumers(workflow);
  const visited = new Map();
  const promptFields = new Map();
  function updatedLink(link, sharedParent = false) {
    const id = linkedNode(workflow, link);
    if (id === undefined) return link;
    const shared = sharedParent || consumers.get(id) > 1;
    const key = JSON.stringify([id, link[1], shared]);
    if (visited.has(key)) {
      const target = visited.get(key);
      return target === id ? link : [target, link[1]];
    }
    visited.set(key, id);
    const node = workflow[id];
    const inputs = { ...node.inputs };
    const fields = new Set();
    let changed = false;
    for (const name of positiveInputNames(node, link[1])) {
      const value = inputs[name];
      const source = authored[id]?.inputs?.[name];
      if (typeof value === "string" && typeof source === "string" && source.includes(marker)) {
        fields.add(name);
        inputs[name] = source.split(marker).join(prompt);
      } else {
        inputs[name] = updatedLink(value, shared);
      }
      changed ||= inputs[name] !== value;
    }
    if (!changed || !shared) {
      if (fields.size) promptFields.set(id, fields);
      if (changed) node.inputs = inputs;
      return link;
    }
    const clone = cloneNode(workflow, { ...node, inputs });
    if (fields.size) promptFields.set(clone, fields);
    visited.set(key, clone);
    return [clone, link[1]];
  }
  for (const [inputs, key] of roots) inputs[key] = updatedLink(inputs[key]);
  return promptFields;
}

function collectPositiveText(workflow, roots, promptFields) {
  const visited = new Set();
  const texts = new Set();
  function visit(link) {
    const id = linkedNode(workflow, link);
    if (id === undefined) return;
    const port = JSON.stringify([id, link[1]]);
    if (visited.has(port)) return;
    visited.add(port);
    const node = workflow[id];
    for (const key of positiveInputNames(node, link[1])) {
      const value = node?.inputs?.[key];
      if ((/^text(?:_|$)/.test(key) || key === "value" || promptFields.get(id)?.has(key)) && typeof value === "string" && value) texts.add(value);
      else visit(value);
    }
  }
  for (const [inputs, key] of roots) visit(inputs[key]);
  return [...texts].join("\n\n");
}

function applyConditioning(workflow, samplers, input, updateText) {
  const consumers = countConsumers(workflow);
  const encoders = new Map();
  let verified = samplers.length > 0;
  for (const sampler of samplers) {
    const link = sampler.inputs?.[input];
    const encoder = Array.isArray(link) && link.length === 2 && link[1] === 0 && workflow[link[0]];
    if (!DIRECT_SAMPLERS.includes(sampler.class_type) || encoder?.class_type !== "CLIPTextEncode" || typeof encoder.inputs?.text !== "string") {
      verified = false;
      continue;
    }
    const id = String(link[0]);
    if (!encoders.has(id)) encoders.set(id, []);
    encoders.get(id).push(sampler);
  }
  for (const [id, samplersUsingEncoder] of encoders) {
    const node = workflow[id];
    const text = updateText(node.inputs.text, id);
    if (text === node.inputs.text) continue;
    const inputs = { ...node.inputs, text };
    if (consumers.get(id) === samplersUsingEncoder.length) {
      node.inputs = inputs;
    } else {
      // Leave other branches on the unmodified encoder.
      const cloneId = cloneNode(workflow, { ...node, inputs });
      for (const sampler of samplersUsingEncoder) sampler.inputs[input] = [cloneId, 0];
    }
  }
  return verified;
}

module.exports = {
  ComfyUiAdapter,
};
