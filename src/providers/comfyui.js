const fs = require("fs");
const { setTimeout: sleep } = require("node:timers/promises");
const path = require("path");
const { toDataUrl } = require("../utils");

class ComfyUiAdapter {
  constructor(config) {
    this.baseUrl = config.baseUrl.replace(/\/$/, "");
    this.checkpoint = config.checkpoint || "model.safetensors";
    this.workflowFile = config.workflowFile;
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
    const workflow = this.workflowFile
      ? loadWorkflowTemplate(this.workflowFile, {
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
        })
      : buildDefaultWorkflow({
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
        });

    const enqueueResponse = await fetch(`${this.baseUrl}/prompt`, {
      method: "POST",
      signal,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ prompt: workflow }),
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
        },
      ],
      metadata: {
        promptId,
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

function loadWorkflowTemplate(filePath, variables) {
  const resolvedPath = path.resolve(filePath);
  const template = fs.readFileSync(resolvedPath, "utf8");
  const hydrated = template.replace(/"(?:[^"\\]|\\.)*"|\{\{(\w+)\}\}/g, (token, key) => {
    if (key) return JSON.stringify(variables[key] ?? "");
    if (!token.includes("{{")) return token;
    return JSON.stringify(JSON.parse(token).replace(/\{\{(\w+)\}\}/g, (_, name) => String(variables[name] ?? "")));
  });
  const workflow = JSON.parse(hydrated);
  applyWorkflowNegatives(workflow, variables.negativePrompt);
  return workflow;
}

function applyWorkflowNegatives(workflow, negativePrompt) {
  const supportedTypes = ["KSampler", "KSamplerAdvanced", "SamplerCustom"];
  const samplers = Object.values(workflow).filter(node =>
    supportedTypes.includes(node?.class_type) ||
    (/sampler/i.test(node?.class_type) && ["negative", "guider", "latent_image"].some(key => Object.hasOwn(node.inputs || {}, key))));
  if (!samplers.length || samplers.some(node => !supportedTypes.includes(node.class_type))) {
    throw new Error("ComfyUI workflow needs verifiable sampler conditioning on KSampler, KSamplerAdvanced or SamplerCustom nodes.");
  }
  const positives = new Set();
  const negatives = new Set();
  function collectPositive(link) {
    if (!Array.isArray(link) || link.length !== 2 || !Number.isInteger(link[1])) return;
    const id = String(link[0]);
    if (!Object.hasOwn(workflow, id) || positives.has(id)) return;
    positives.add(id);
    for (const input of Object.values(workflow[id]?.inputs || {})) collectPositive(input);
  }
  for (const sampler of samplers) {
    const link = sampler.inputs?.negative;
    const encoder = Array.isArray(link) && link[1] === 0 && workflow[link[0]];
    if (encoder?.class_type !== "CLIPTextEncode" || typeof encoder.inputs?.text !== "string") {
      throw new Error("Every ComfyUI sampler negative input must link directly to a CLIPTextEncode text node.");
    }
    negatives.add(String(link[0]));
    collectPositive(sampler.inputs?.positive);
  }
  for (const id of positives) {
    const text = workflow[id]?.inputs?.text;
    if (negatives.has(id) || (negativePrompt && typeof text === "string" && text.includes(negativePrompt))) {
      throw new Error("ComfyUI workflow must keep positive conditioning separate from negative prompt text.");
    }
  }
  for (const id of negatives) {
    const inputs = workflow[id].inputs;
    if (negativePrompt && !inputs.text.includes(negativePrompt)) {
      inputs.text = [negativePrompt, inputs.text.trim()].filter(Boolean).join(", ");
    }
  }
}

module.exports = {
  ComfyUiAdapter,
};
