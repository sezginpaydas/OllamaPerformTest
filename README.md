# Ollama Performance Tester

Lokalde calisan Ollama modelleri uzerinde paralel performans testi yapmak icin kullanilir.
Secilen modele birden fazla kullanici simule ederek es zamanli istek gonderir ve sonuclari
terminal gorunumunde canli olarak gosterir.


## Gereksinimler

- Python 3.9+
- Ollama (https://ollama.com)
- Ollama uzerinde en az bir model yuklu olmali (ornek: `ollama pull qwen3:0.6b`)

## Kurulum

```
pip install fastapi uvicorn httpx websockets
```

## Calistirma

```
python server.py
```

Tarayicida `http://localhost:8000` adresine gidin.

## Kullanim

1. Acilan ekranda model secin.
2. `num_parallel` degerini girin. Bu deger Ollama'nin ayni anda kac istegi paralel isleyecegini belirler. Deger degistiginde Ollama otomatik olarak yeniden baslatilir.
3. Kullanici sayisini girin. Her kullanici ayri bir istek gonderir.
4. Max kelime alani ile modelin uretecegi cevap uzunlugunu sinirlayin. Yuksek kullanici sayisi testleri icin dusuk tutun (10-20 kelime gibi).
5. Baslat tusuna basin.

Test ekraninda her kullanici icin ayri bir terminal penceresi olusur. Aktif terminallerde yesil animasyon akar, tamamlanan terminaller mavi cerceve ile gosterilir.

Test bittiginde alt barda su metrikler gosterilir:

- Cold Start: Modelin bellegine yuklenmesi icin gecen sure (warm-up)
- Benchmark Suresi: Gercek test suresi (warm-up haric)
- Ort. Token/s: Tamamlanan isteklerin ortalama token hizi
- Toplam Token: Uretilen toplam token sayisi

## num_parallel Hakkinda

`OLLAMA_NUM_PARALLEL` Ollama sunucu seviyesinde bir environment variable'dir. Deger degistiginde uygulama Ollama'yi otomatik olarak kapatip yeni deger ile yeniden baslatir. Bu islem sirasinda ekranda loading overlay gosterilir.

Ayni `num_parallel` degeri ile arka arkaya test yapildiginda Ollama yeniden baslatilmaz, sadece model unload/reload yapilir.

## Dosya Yapisi

```
PerformTest/
  server.py           # FastAPI backend, WebSocket, Ollama API
  static/
    index.html         # Sayfa yapisi
    style.css          # Tema ve gorunum
    app.js             # Frontend, WebSocket, terminal yonetimi
```

## Notlar

- Uygulama sadece Windows uzerinde test edilmistir. Ollama process yonetimi (taskkill, ollama app.exe) Windows'a ozeldir.
- Test baslatildiginda Ollama tray uygulamasi kapanabilir. Testler bittikten sonra tekrar acabilirsiniz.
- Model bellekte 30 dakika tutulur (keep_alive). Ayni model ile arka arkaya test yaparken cold start suresi dusuk olur.
