# Talking verdicts (open-source face + voice)

Any finished session can be delivered as a short video: your twin speaks the
verdict in your cloned face and voice, right inside the app. The clip is
downloadable, so you can forward it anywhere (including WhatsApp as a video
message).

Everything is open-source and runs on your own machine. No avatar accounts,
no per-video API fees, and your photo + voice sample never leave the backend.

## What this is — and isn't

- **Is:** local text-to-speech voice cloning plus an animated video of your
  photo. On an NVIDIA GPU box with MuseTalk, you get true lip-sync; on a
  regular laptop you get an animated portrait with your cloned voice.
- **Isn't:** answering live WhatsApp/Messenger video calls as your clone. No
  public API allows injecting a synthetic participant into someone else's live
  call — that stays a north-star only Meta could unlock in-app.

## License stack (why it's safe)

| Piece | Project | License |
|---|---|---|
| Base speech (EN) | MeloTTS (MyShell) | MIT |
| Voice cloning | OpenVoice V2 (MIT + MyShell) | MIT |
| Portrait video | imageio-ffmpeg (static ffmpeg) | MIT |
| Lip-sync (GPU) | MuseTalk (Tencent Music) | MIT code; weights free incl. commercial |

Deliberately avoided: F5-TTS (MIT code but CC-BY-NC weights), XTTS (custom
CPML model license), Wav2Lip (original repo ships no license file), and all
proprietary cloning APIs.

## Setup

```bash
cd /Users/blackrossay/meta_hackathon
source .venv/bin/activate
pip install -e "services/api[avatar]"
pip install git+https://github.com/myshell-ai/MeloTTS.git \
            git+https://github.com/myshell-ai/OpenVoice.git
python -m unidic download
```

Then download the OpenVoice V2 checkpoints (converter + `en-newest` base
speaker) following the [OpenVoice README](https://github.com/myshell-ai/OpenVoice),
and place them so this layout exists (override with `TWINVERSE_OPENVOICE_CKPT`):

```text
models/openvoice_v2/
  converter/config.json
  converter/checkpoint.pth
  base_speakers/ses/en-newest.pth
```

Restart the API. The session page's *Talking verdict* panel walks you through
uploading a photo + voice sample, then renders on demand.

### GPU lip-sync (optional)

On a CUDA machine, for true lip-sync instead of the animated portrait:

```bash
git clone https://github.com/TMElyralab/MuseTalk.git
cd MuseTalk && pip install -r requirements.txt
# download the v1.5 weights per the MuseTalk README, then:
export TWINVERSE_MUSETALK_REPO=/path/to/MuseTalk
```

CPU boxes automatically use portrait mode — no configuration needed.

## Behavior notes

- Script = fixed opening + verdict summary, capped at ~700 chars (~1 min).
- Voice cloning (MeloTTS + OpenVoice) runs fine on CPU; expect a few minutes
  per verdict. Lip-sync needs a GPU to be practical (CPU would take hours).
- English only in this build (`EN-US` base speaker).
- Your likeness lives under `data/avatars/likeness/`; DELETE on the panel (or
  `DELETE /api/avatar/likeness`) removes every byte. Videos land in
  `data/avatars/videos/`.

## Safety rules

- Self-cloning only: upload requires a checkbox confirming the face/voice are
  yours. Never configure another person's likeness without their consent.
- Every player is captioned as an AI-generated likeness with the render mode.
- If a render fails, the job record keeps the error and the UI offers a retry
  — nothing is faked or stubbed.
