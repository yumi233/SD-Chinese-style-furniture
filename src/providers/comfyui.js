const fs = require("fs");
const { setTimeout: sleep } = require("node:timers/promises");
const path = require("path");
const { toDataUrl } = require("../utils");

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

  async generate({ request, settings, signal }) {
    const loaded = this.workflowFile
      ? loadWorkflowTemplate(this.workflowFile, {
          prompt: request.prompt,
          negativePrompt: request.userNegativePrompt ?? request.negativePrompt,
          width: settings.width,
          height: settings.height,
          steps: settings.steps,
          cfgScale: settings.cfgScale,
          samplerName: settings.samplerName,
          scheduler: settings.scheduler,
          seed: settings.seed,
          checkpoint: this.checkpoint,
        }, request.defaultNegativePrompt)
      : { verified: true, workflow: buildDefaultWorkflow({
          prompt: request.prompt,
          negativePrompt: request.negativePrompt,
          width: settings.width,
          height: settings.height,
          steps: settings.steps,
          cfgScale: settings.cfgScale,
          samplerName: settings.samplerName,
          scheduler: settings.scheduler,
          seed: settings.seed,
          checkpoint: this.checkpoint,
        }) };
    if (!loaded.verified && this.strictNegativeValidation) {
      const error = new Error("ComfyUI workflow has unverified negative conditioning.");
      error.statusCode = 400;
      throw error;
    }
    const warning = loaded.verified ? null : { code: "COMFYUI_NEGATIVE_UNVERIFIED", message: "反向词未验证" };

    const enqueueResponse = await fetch(`${this.baseUrl}/prompt`, {
      method: "POST",
      signal,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ prompt: loaded.workflow }),
    });

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
          ...(warning ? { warning } : {}),
        },
      ],
      metadata: {
        promptId,
        ...(warning ? { warning } : {}),
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

function loadWorkflowTemplate(filePath, variables, defaultNegativePrompt = "") {
  const resolvedPath = path.resolve(filePath);
  const template = fs.readFileSync(resolvedPath, "utf8");
  const hydrated = template.replace(/"(?:[^"\\]|\\.)*"|\{\{(\w+)\}\}/g, (token, key) => {
    if (key) return JSON.stringify(variables[key] ?? "");
    if (!token.includes("{{")) return token;
    return JSON.stringify(JSON.parse(token).replace(/\{\{(\w+)\}\}/g, (_, name) => String(variables[name] ?? "")));
  });
  const workflow = JSON.parse(hydrated);
  return { workflow, verified: applyWorkflowNegatives(workflow, defaultNegativePrompt, variables.negativePrompt) };
}

function applyWorkflowNegatives(workflow, defaults, userPrompt) {
  const supportedTypes = ["KSampler", "KSamplerAdvanced", "SamplerCustom"];
  const samplers = Object.values(workflow).filter(node =>
    supportedTypes.includes(node?.class_type) ||
    (/sampler/i.test(node?.class_type) && ["negative", "guider", "latent_image"].some(key => Object.hasOwn(node.inputs || {}, key))));
  let verified = samplers.length > 0;
  const consumers = new Map();
  const negatives = new Map();
  for (const node of Object.values(workflow)) {
    for (const link of Object.values(node?.inputs || {})) {
      if (!Array.isArray(link) || link.length !== 2 || !Number.isInteger(link[1])) continue;
      const id = String(link[0]);
      if (Object.hasOwn(workflow, id)) consumers.set(id, (consumers.get(id) || 0) + 1);
    }
  }
  for (const sampler of samplers) {
    const link = sampler.inputs?.negative;
    const encoder = Array.isArray(link) && link[1] === 0 && workflow[link[0]];
    if (!supportedTypes.includes(sampler.class_type) || encoder?.class_type !== "CLIPTextEncode" || typeof encoder.inputs?.text !== "string") {
      verified = false;
      continue;
    }
    const id = String(link[0]);
    if (!negatives.has(id)) negatives.set(id, []);
    negatives.get(id).push(sampler);
  }
  let nextId = 1;
  for (const [id, samplersUsingEncoder] of negatives) {
    const node = workflow[id];
    const text = node.inputs.text;
    const additions = [defaults, userPrompt].filter(value => value && !text.includes(value));
    if (!additions.length) continue;
    const inputs = { ...node.inputs, text: [...additions, text.trim()].filter(Boolean).join(", ") };
    if (consumers.get(id) === samplersUsingEncoder.length) {
      node.inputs = inputs;
    } else {
      // Leave positive and indirect consumers on the original encoder.
      while (Object.hasOwn(workflow, String(nextId))) nextId++;
      const cloneId = String(nextId++);
      workflow[cloneId] = { ...node, inputs };
      for (const sampler of samplersUsingEncoder) sampler.inputs.negative = [cloneId, 0];
    }
  }
  return verified;
}

module.exports = {
  ComfyUiAdapter,
};
