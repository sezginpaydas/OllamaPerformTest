import asyncio
import json
import os
import subprocess
import time
from typing import Dict

import httpx
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

app = FastAPI(title="Ollama Performance Tester")

OLLAMA_BASE = "http://localhost:11434"

active_tests: Dict[str, asyncio.Task] = {}
cancel_events: Dict[str, asyncio.Event] = {}
current_num_parallel: int = 0

TEST_PROMPTS = [
    "Explain quantum computing in simple terms.",
    "Write a short story about a robot learning to paint.",
    "What are the main differences between Python and JavaScript?",
    "Describe the process of photosynthesis step by step.",
    "Explain the theory of relativity like I'm 10 years old.",
    "What are the benefits of microservices architecture?",
    "Write a haiku about artificial intelligence.",
    "Explain how blockchain technology works.",
    "What are the key principles of clean code?",
    "Describe the water cycle in detail.",
    "How does machine learning differ from traditional programming?",
    "Explain the concept of recursion with an example.",
    "What are the main causes of climate change?",
    "Describe the process of making chocolate from cocoa beans.",
    "Explain how the internet works in simple terms.",
    "What are design patterns in software engineering?",
    "Write a brief history of space exploration.",
    "Explain the difference between SQL and NoSQL databases.",
    "What is the significance of the Turing test?",
    "Describe the lifecycle of a star.",
]


async def restart_ollama_with_parallel(num_parallel: int) -> bool:
    global current_num_parallel

    ollama_exe_path = None
    try:
        result = subprocess.run(
            ["powershell", "-Command",
             "(Get-Process -Name 'ollama' -ErrorAction SilentlyContinue | Select-Object -First 1).Path"],
            capture_output=True, text=True, timeout=10
        )
        path = result.stdout.strip()
        if path and os.path.exists(path):
            ollama_exe_path = path
    except Exception:
        pass

    if not ollama_exe_path:
        fallback = os.path.expandvars(r"%LOCALAPPDATA%\Programs\Ollama\ollama.exe")
        if os.path.exists(fallback):
            ollama_exe_path = fallback

    if not ollama_exe_path:
        print(f"[WARN] ollama.exe bulunamadi")
        return False

    print(f"[INFO] Ollama path: {ollama_exe_path}")
    print(f"[INFO] Ollama durduruluyor (num_parallel={num_parallel})...")

    for proc_name in ["ollama app", "ollama app.exe", "ollama", "ollama.exe",
                       "ollama_llama_server", "ollama_llama_server.exe"]:
        try:
            subprocess.run(["taskkill", "/F", "/IM", proc_name], capture_output=True, timeout=10)
        except Exception:
            pass

    for retry in range(10):
        await asyncio.sleep(1)
        try:
            result = subprocess.run(
                ["powershell", "-Command",
                 "(Get-Process -Name 'ollama*' -ErrorAction SilentlyContinue).Count"],
                capture_output=True, text=True, timeout=5
            )
            count = int(result.stdout.strip() or "0")
            if count == 0:
                print(f"[INFO] Tum Ollama process'leri kapatildi ({retry+1}s)")
                break
        except Exception:
            pass
    else:
        print("[WARN] Bazi Ollama process'leri hala calisyor olabilir")

    await asyncio.sleep(1)

    env = os.environ.copy()
    env["OLLAMA_NUM_PARALLEL"] = str(num_parallel)

    try:
        print(f"[INFO] Baslatiliyor: {ollama_exe_path} serve (NUM_PARALLEL={num_parallel})")
        subprocess.Popen(
            [ollama_exe_path, "serve"],
            env=env,
            creationflags=subprocess.CREATE_NO_WINDOW | subprocess.DETACHED_PROCESS,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
    except Exception as e:
        print(f"[ERROR] Ollama baslatilamadi: {e}")
        return False

    for attempt in range(30):
        await asyncio.sleep(1)
        try:
            async with httpx.AsyncClient(timeout=3.0) as client:
                resp = await client.get(f"{OLLAMA_BASE}/api/tags")
                if resp.status_code == 200:
                    current_num_parallel = num_parallel
                    print(f"[INFO] Ollama hazir ({attempt+1}s, num_parallel={num_parallel})")
                    return True
        except Exception:
            continue

    print("[ERROR] Ollama 30s icinde ayaga kalkmadi")
    return False


@app.get("/")
async def root():
    return FileResponse("static/index.html")


@app.get("/api/models")
async def list_models():
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(f"{OLLAMA_BASE}/api/tags")
            resp.raise_for_status()
            data = resp.json()
            models = []
            for m in data.get("models", []):
                models.append({
                    "name": m.get("name", ""),
                    "size": m.get("size", 0),
                    "modified_at": m.get("modified_at", ""),
                    "details": m.get("details", {}),
                })
            return {"models": models}
    except httpx.ConnectError:
        return {"error": "Ollama sunucusuna baglanilamiyor. Ollama calisiyor mu?", "models": []}
    except Exception as e:
        return {"error": str(e), "models": []}


@app.get("/api/running")
async def list_running_models():
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(f"{OLLAMA_BASE}/api/ps")
            resp.raise_for_status()
            data = resp.json()
            running = []
            for m in data.get("models", []):
                running.append({
                    "name": m.get("name", ""),
                    "model": m.get("model", ""),
                    "size": m.get("size", 0),
                    "size_vram": m.get("size_vram", 0),
                    "expires_at": m.get("expires_at", ""),
                    "details": m.get("details", {}),
                })
            return {"running": running}
    except httpx.ConnectError:
        return {"error": "Ollama sunucusuna baglanilamiyor.", "running": []}
    except Exception as e:
        return {"error": str(e), "running": []}


@app.post("/api/stop-model")
async def stop_model(payload: dict):
    model_name = payload.get("model", "")
    if not model_name:
        return {"error": "Model adi belirtilmedi."}
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                f"{OLLAMA_BASE}/api/generate",
                json={"model": model_name, "keep_alive": 0},
            )
            resp.raise_for_status()
            return {"success": True, "message": f"{model_name} durduruldu."}
    except Exception as e:
        return {"error": str(e)}


@app.websocket("/ws/test")
async def websocket_test(ws: WebSocket):
    await ws.accept()

    try:
        config_raw = await ws.receive_text()
        config = json.loads(config_raw)

        model = config.get("model", "")
        num_users = config.get("num_users", 1)
        num_parallel = config.get("num_parallel", 1)
        max_words = config.get("max_words", 50)

        if not model:
            await ws.send_json({"type": "error", "user_id": -1, "data": "Model secilmedi."})
            return

        global current_num_parallel

        if current_num_parallel != num_parallel:
            await ws.send_json({
                "type": "system", "user_id": -1,
                "data": f"Ollama yeniden baslatiliyor (OLLAMA_NUM_PARALLEL={num_parallel})...",
                "phase": "unloading",
            })

            success = await restart_ollama_with_parallel(num_parallel)

            if success:
                await ws.send_json({
                    "type": "system", "user_id": -1,
                    "data": f"Ollama hazir! (num_parallel={num_parallel}) Model yukleniyor...",
                    "phase": "reloading",
                })
            else:
                await ws.send_json({
                    "type": "system", "user_id": -1,
                    "data": "Ollama yeniden baslatilamadi! Mevcut ayarlarla devam ediliyor...",
                    "phase": "warning",
                })
        else:
            try:
                async with httpx.AsyncClient(timeout=30.0) as client:
                    await client.post(
                        f"{OLLAMA_BASE}/api/generate",
                        json={"model": model, "keep_alive": 0},
                    )
                await asyncio.sleep(2)
            except Exception:
                pass

            await ws.send_json({
                "type": "system", "user_id": -1,
                "data": f"Model yukleniyor (num_parallel={num_parallel})...",
                "phase": "reloading",
            })

        warm_up_start = time.time()
        try:
            async with httpx.AsyncClient(timeout=120.0) as client:
                await client.post(
                    f"{OLLAMA_BASE}/api/generate",
                    json={
                        "model": model,
                        "prompt": "hi",
                        "stream": False,
                        "options": {"num_predict": 1},
                        "keep_alive": "30m",
                    },
                )

            warm_up_time = round(time.time() - warm_up_start, 2)
            await ws.send_json({
                "type": "system", "user_id": -1,
                "data": f"Model hazir! (warm-up: {warm_up_time}s) Test baslatiliyor...",
                "phase": "ready",
                "warm_up_time": warm_up_time,
            })
        except Exception as e:
            warm_up_time = round(time.time() - warm_up_start, 2)
            await ws.send_json({
                "type": "system", "user_id": -1,
                "data": f"Model yuklenirken hata: {str(e)}. Test devam ediyor...",
                "phase": "warning",
                "warm_up_time": warm_up_time,
            })

        await asyncio.sleep(0.5)

        for i in range(num_users):
            prompt = TEST_PROMPTS[i % len(TEST_PROMPTS)]
            await ws.send_json({
                "type": "init", "user_id": i,
                "data": f"Terminal {i + 1} hazirlaniyor...",
                "prompt": prompt,
            })

        await asyncio.sleep(0.3)

        session_id = f"session_{id(ws)}"
        cancel_event = asyncio.Event()
        cancel_events[session_id] = cancel_event

        tasks = []
        for i in range(num_users):
            prompt = TEST_PROMPTS[i % len(TEST_PROMPTS)]
            task = asyncio.create_task(
                stream_to_user(ws, model, i, prompt, cancel_event, max_words)
            )
            tasks.append(task)

        async def listen_for_cancel():
            try:
                while True:
                    msg = await ws.receive_text()
                    data = json.loads(msg)
                    if data.get("type") == "cancel":
                        cancel_event.set()
                        break
            except (WebSocketDisconnect, Exception):
                cancel_event.set()

        cancel_listener = asyncio.create_task(listen_for_cancel())

        await asyncio.gather(*tasks, return_exceptions=True)
        cancel_listener.cancel()

        cancel_events.pop(session_id, None)

        await ws.send_json({
            "type": "all_done", "user_id": -1,
            "data": "Tum testler tamamlandi!",
        })

    except WebSocketDisconnect:
        pass
    except Exception as e:
        try:
            await ws.send_json({"type": "error", "user_id": -1, "data": str(e)})
        except Exception:
            pass


async def stream_to_user(ws, model, user_id, prompt, cancel_event, max_words=50):
    start_time = time.time()
    token_count = 0
    system_prompt = f"Yanitini maksimum {max_words} kelime ile sinirla. Kisa ve oz cevap ver."

    try:
        await ws.send_json({"type": "status", "user_id": user_id, "data": "waiting"})

        async with httpx.AsyncClient(timeout=httpx.Timeout(300.0, connect=30.0)) as client:
            async with client.stream(
                "POST",
                f"{OLLAMA_BASE}/api/generate",
                json={
                    "model": model,
                    "prompt": prompt,
                    "system": system_prompt,
                    "stream": True,
                },
            ) as response:
                first_token = True

                async for line in response.aiter_lines():
                    if cancel_event.is_set():
                        await ws.send_json({"type": "status", "user_id": user_id, "data": "cancelled"})
                        return

                    if not line.strip():
                        continue

                    try:
                        chunk = json.loads(line)
                    except json.JSONDecodeError:
                        continue

                    if first_token:
                        first_token = False
                        await ws.send_json({"type": "status", "user_id": user_id, "data": "active"})

                    token_text = chunk.get("response", "")
                    if token_text:
                        token_count += 1
                        await ws.send_json({"type": "token", "user_id": user_id, "data": token_text})

                    if chunk.get("done", False):
                        elapsed = time.time() - start_time
                        eval_count = chunk.get("eval_count", token_count)
                        eval_duration = chunk.get("eval_duration", 0)
                        tokens_per_sec = (
                            eval_count / (eval_duration / 1e9) if eval_duration > 0 else 0
                        )

                        await ws.send_json({
                            "type": "done", "user_id": user_id, "data": "completed",
                            "stats": {
                                "total_time": round(elapsed, 2),
                                "tokens": eval_count,
                                "tokens_per_sec": round(tokens_per_sec, 2),
                                "prompt_eval_count": chunk.get("prompt_eval_count", 0),
                                "prompt_eval_duration_ms": round(chunk.get("prompt_eval_duration", 0) / 1e6, 2),
                            },
                        })
                        return

    except httpx.ConnectError:
        await ws.send_json({"type": "error", "user_id": user_id, "data": "Ollama baglanti hatasi!"})
    except Exception as e:
        await ws.send_json({"type": "error", "user_id": user_id, "data": f"Hata: {str(e)}"})


app.mount("/static", StaticFiles(directory="static"), name="static")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
