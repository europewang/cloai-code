#sudo -n docker compose -f deploy/docker-compose-xinference.yml up -d
import requests

BASE_URL = "http://127.0.0.1:8085/v1"

def launch_model(model_uid, model_name, model_type, **kwargs):
    print(f"Launching {model_name} ({model_type}) as {model_uid}...", flush=True)
    
    # Check if already running
    try:
        list_resp = requests.get(f"{BASE_URL}/models")
        if list_resp.status_code == 200:
            running_models = list_resp.json()
            if model_uid in running_models:
                print(f"Model {model_uid} is already running. Skipping launch.", flush=True)
                return
    except Exception as e:
        print(f"Error checking running models: {e}", flush=True)

    url = f"{BASE_URL}/models"
    payload = {
        "model_uid": model_uid,
        "model_name": model_name,
        "model_type": model_type,
    }
    payload.update(kwargs)
    
    try:
        resp = requests.post(url, json=payload)
        if resp.status_code == 200:
            print(f"Success: {model_uid}", flush=True)
        else:
            print(f"Failed to launch {model_uid}: {resp.status_code} - {resp.text}", flush=True)
    except Exception as e:
        print(f"Error launching {model_name}: {e}", flush=True)

if __name__ == "__main__":
    print("Starting Xinference models launch sequence...", flush=True)
    
    # 1. Launch Embedding
    launch_model(
        model_uid="bge-m3",
        model_name="bge-m3",
        model_type="embedding"
    )
    
    # 2. Launch Rerank
    launch_model(
        model_uid="bge-reranker-v2-m3",
        model_name="bge-reranker-v2-m3",
        model_type="rerank"
    )
    
    print("Skip launching Xinference LLM on purpose.", flush=True)
    print("LLM is provided by Ollama (qwen3.5:9b).", flush=True)
    print("Launch sequence completed.", flush=True)
