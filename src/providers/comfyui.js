const fs = require("fs");
const path = require("path");
const { sleep, toDataUrl } = require("../utils");

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

  async generate({ request, settings }) {
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
    const history = await waitForHistory(this.baseUrl, promptId);
    const imageRef = pickFirstImage(history);

    if (!imageRef) {
      throw new Error("ComfyUI finished without image output.");
    }

    const imageResponse = await fetch(
      `${this.baseUrl}/view?filename=${encodeURIComponent(imageRef.filename)}&subfolder=${encodeURIComponent(
        imageRef.subfolder || "",
      )}&type=${encodeURIComponent(imageRef.type || "output")}`,
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

async function waitForHistory(baseUrl, promptId) {
  const startedAt = Date.now();
  const timeoutMs = 120000;

  while (Date.now() - startedAt < timeoutMs) {
    const response = await fetch(`${baseUrl}/history/${promptId}`);
    if (!response.ok) {
      await sleep(1000);
      continue;
    }

    const json = await response.json();
    if (json[promptId] && json[promptId].outputs) {
      return json[promptId];
    }

    await sleep(1000);
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
  const hydrated = template.replace(/\{\{(\w+)\}\}/g, (_, key) => String(variables[key] ?? ""));
  return JSON.parse(hydrated);
}

module.exports = {
  ComfyUiAdapter,
};
