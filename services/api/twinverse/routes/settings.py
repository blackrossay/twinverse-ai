"""Owner settings endpoints: where avatar/voice inference runs."""

from functools import lru_cache

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from ..app_config import AppConfig
from ..avatar.provider import inference_ready, provider_mode
from ..avatar.provider import missing as provider_missing
from ..settings import get_settings

router = APIRouter(prefix="/api/settings", tags=["settings"])


@lru_cache(maxsize=4)
def _config_for(db_path: str) -> AppConfig:
    return AppConfig(db_path)


def get_config() -> AppConfig:
    return _config_for(get_settings().twinverse_db_path)


class InferenceSettingsIn(BaseModel):
    provider: str = "local"  # local | http
    inference_url: str = Field(default="", max_length=300)
    inference_token: str = Field(default="", max_length=500)  # blank = keep saved


class InferenceSettingsView(BaseModel):
    provider: str
    inference_url: str
    token_hint: str = ""
    ready: bool
    missing: list[str] = []


def _view(config: AppConfig) -> InferenceSettingsView:
    saved = config.get_all()
    update = {}
    if saved.get("avatar_provider") in ("local", "http"):
        update["twinverse_avatar_provider"] = saved["avatar_provider"]
    if "inference_url" in saved:
        update["twinverse_inference_url"] = saved["inference_url"]
    if saved.get("inference_token"):
        update["twinverse_inference_token"] = saved["inference_token"]
    settings = get_settings().model_copy(update=update)
    token = saved.get("inference_token", "")
    return InferenceSettingsView(
        provider=provider_mode(settings),
        inference_url=settings.twinverse_inference_url,
        token_hint=f"••••{token[-4:]}" if token else "",
        ready=inference_ready(settings),
        missing=provider_missing(settings),
    )


@router.get("/inference", response_model=InferenceSettingsView)
def get_inference(config: AppConfig = Depends(get_config)) -> InferenceSettingsView:
    return _view(config)


@router.put("/inference", response_model=InferenceSettingsView)
def set_inference(
    body: InferenceSettingsIn, config: AppConfig = Depends(get_config)
) -> InferenceSettingsView:
    if body.provider not in ("local", "http"):
        raise HTTPException(status_code=422, detail="provider must be 'local' or 'http'")
    if body.provider == "http" and body.inference_url and not body.inference_url.startswith(
        ("http://", "https://")
    ):
        raise HTTPException(status_code=422, detail="inference_url must start with http(s)://")
    values = {
        "avatar_provider": body.provider,
        "inference_url": body.inference_url.strip(),
    }
    if body.inference_token.strip():
        values["inference_token"] = body.inference_token.strip()
    config.set_many(values)
    return _view(config)
