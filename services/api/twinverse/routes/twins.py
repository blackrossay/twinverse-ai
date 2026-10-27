"""Twin CRUD + seed + identity card endpoints."""

from functools import lru_cache

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from fastapi.responses import FileResponse

from ..identity.cards import build_prompt, card_path, delete_card, save_card
from ..identity.extraction import extract_identity
from ..identity.schemas import (
    Fact,
    Hypothesis,
    IdentityPayload,
    ProvenanceEntry,
    Twin,
    TwinCreate,
    TwinDetail,
    TwinPatch,
)
from ..identity.seeds import SEEDS, seed_payload
from ..identity.store import IdentityStore
from ..meta_client import MetaClient, MetaClientError, default_client
from ..settings import get_settings

twins_router = APIRouter(prefix="/api/twins", tags=["twins"])


@lru_cache(maxsize=4)
def _store_for(db_path: str) -> IdentityStore:
    return IdentityStore(db_path)


def get_store() -> IdentityStore:
    return _store_for(get_settings().twinverse_db_path)


def get_card_dir() -> str:
    return get_settings().twinverse_card_dir


def get_model_client() -> MetaClient:
    return default_client()


def _direct_payload(body: TwinCreate, source: str) -> IdentityPayload:
    fields = [k for k in ("verified_facts", "skills", "goals", "constraints",
                           "behavioral_hypotheses", "communication_style") if getattr(body, k)]
    return IdentityPayload(
        verified_facts=[Fact(**f.model_dump()) for f in body.verified_facts],
        skills=list(body.skills),
        goals=list(body.goals),
        constraints=list(body.constraints),
        behavioral_hypotheses=[Hypothesis(**h.model_dump()) for h in body.behavioral_hypotheses],
        communication_style=dict(body.communication_style),
        consent=dict(body.consent),
        bio=body.bio,
        provenance=[ProvenanceEntry(field=f, source=source) for f in fields],
    )


@twins_router.post("", response_model=TwinDetail, status_code=status.HTTP_201_CREATED)
def create_twin(
    body: TwinCreate,
    store: IdentityStore = Depends(get_store),
    client: MetaClient = Depends(get_model_client),
) -> TwinDetail:
    if body.bio and not body.has_structured_input:
        try:
            payload = extract_identity(body.bio, body.name, client)
        except MetaClientError as exc:
            raise HTTPException(status_code=502, detail=str(exc)) from None
    elif not body.has_structured_input:
        raise HTTPException(
            status_code=422, detail="provide a bio for AI extraction or structured fields"
        )
    else:
        payload = _direct_payload(body, "user")
    return store.create_twin(body.name, payload, body.profile_type)


@twins_router.get("", response_model=list[Twin])
def list_twins(
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    store: IdentityStore = Depends(get_store),
) -> list[Twin]:
    return store.list_twins(limit=limit, offset=offset)


@twins_router.post("/seed", response_model=list[TwinDetail], status_code=status.HTTP_201_CREATED)
def seed_twins(store: IdentityStore = Depends(get_store)) -> list[TwinDetail]:
    existing = {t.name for t in store.list_twins()}
    created = []
    for seed in SEEDS:
        if seed.name not in existing:
            created.append(store.create_twin(seed.name, seed_payload(seed), seed.profile_type))
    return created


@twins_router.get("/{twin_id}", response_model=TwinDetail)
def get_twin(
    twin_id: str, version: int | None = None, store: IdentityStore = Depends(get_store)
) -> TwinDetail:
    twin = store.get_twin(twin_id, version)
    if twin is None:
        raise HTTPException(status_code=404, detail="twin or version not found")
    return twin


@twins_router.get("/{twin_id}/versions", response_model=list[int])
def list_versions(twin_id: str, store: IdentityStore = Depends(get_store)) -> list[int]:
    versions = store.list_versions(twin_id)
    if not versions:
        raise HTTPException(status_code=404, detail="twin not found")
    return versions


@twins_router.patch("/{twin_id}", response_model=TwinDetail)
def patch_twin(
    twin_id: str, body: TwinPatch, store: IdentityStore = Depends(get_store)
) -> TwinDetail:
    current = store.get_twin(twin_id)
    if current is None:
        raise HTTPException(status_code=404, detail="twin not found")
    data = current.payload.model_dump()
    touched: list[str] = []
    for field in ("verified_facts", "skills", "goals", "constraints",
                  "behavioral_hypotheses", "communication_style", "consent", "bio"):
        value = getattr(body, field)
        if value is not None:
            if field == "verified_facts":
                data[field] = [Fact(**v.model_dump()).model_dump(mode="json") for v in value]
            elif field == "behavioral_hypotheses":
                data[field] = [Hypothesis(**v.model_dump()).model_dump(mode="json") for v in value]
            else:
                data[field] = value
            touched.append(field)
    payload = IdentityPayload.model_validate(data)
    payload.provenance.extend(
        ProvenanceEntry(field=f, source="user-edit") for f in touched
    )
    updated = store.update_twin(twin_id, payload, body.name)
    assert updated is not None
    return updated


@twins_router.delete("/{twin_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_twin(
    twin_id: str,
    store: IdentityStore = Depends(get_store),
    card_dir: str = Depends(get_card_dir),
) -> Response:
    if not store.delete_twin(twin_id):
        raise HTTPException(status_code=404, detail="twin not found")
    delete_card(twin_id, card_dir)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@twins_router.post("/{twin_id}/image", status_code=status.HTTP_201_CREATED)
def create_image(
    twin_id: str,
    store: IdentityStore = Depends(get_store),
    card_dir: str = Depends(get_card_dir),
    client: MetaClient = Depends(get_model_client),
) -> dict:
    twin = store.get_twin(twin_id)
    if twin is None:
        raise HTTPException(status_code=404, detail="twin not found")
    try:
        png = client.generate_image(build_prompt(twin))
    except MetaClientError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from None
    save_card(twin_id, png, card_dir)
    return {"twin_id": twin_id, "url": f"/api/twins/{twin_id}/image", "bytes": len(png)}


@twins_router.get("/{twin_id}/image")
def get_image(
    twin_id: str,
    store: IdentityStore = Depends(get_store),
    card_dir: str = Depends(get_card_dir),
) -> FileResponse:
    if store.get_twin(twin_id) is None:
        raise HTTPException(status_code=404, detail="twin not found")
    path = card_path(twin_id, card_dir)
    if not path.exists():
        raise HTTPException(status_code=404, detail="no identity card yet")
    return FileResponse(path, media_type="image/png")
