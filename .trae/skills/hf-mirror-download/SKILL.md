---
name: "hf-mirror-download"
description: "Downloads Hugging Face models using hf-mirror.com. Invoke when user needs to download models in China or has connection issues with huggingface.co."
---

# Hugging Face Mirror Download

This skill provides a reliable method to download Hugging Face models using the `hf-mirror.com` mirror site, specifically optimized for environments with network restrictions or proxy requirements.

## Resources

This skill directory contains the following reusable files:
1.  **`download.py`**: A robust Python script handling environment configuration, argument parsing, and `huggingface_hub` interaction.
2.  **`download_config.json`**: A template configuration file for managing model downloads.

## Usage

You can directly run the script from this skill or copy it to the user's codebase.

### Method 1: Run Directly

```bash
# Example: Download via CLI arguments
python .trae/skills/hf-mirror-download/download.py \
  --repo-id "deepseek-ai/DeepSeek-R1-Distill-Qwen-14B" \
  --download-dir "./models/deepseek-r1-distill-qwen-14b"

# Example: Download via Config
python .trae/skills/hf-mirror-download/download.py \
  --config-path .trae/skills/hf-mirror-download/download_config.json \
  --config-name "deepseek-r1-distill-qwen-14b"
```

### Method 2: Integrate into Project

If the user needs a permanent download script, copy these files to their project:

```bash
mkdir -p scripts
cp .trae/skills/hf-mirror-download/download.py scripts/
cp .trae/skills/hf-mirror-download/download_config.json scripts/
```

## Core Principles (Implemented in `download.py`)

1.  **Endpoint Configuration**: The script sets `HF_ENDPOINT=https://hf-mirror.com` **BEFORE** importing `huggingface_hub`.
2.  **Proxy Management**: When running the script, ensure you unset proxies if they cause SSL errors:
    ```bash
    export http_proxy="" https_proxy="" ALL_PROXY="" && python -u download.py ...
    ```
3.  **Progress Visibility**: Use `python -u` to disable output buffering and see real-time progress bars.
