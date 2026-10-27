"""Signup / login / me endpoints."""

from functools import lru_cache

from fastapi import APIRouter, Depends, Header, HTTPException, status

from ..auth.store import AuthResult, Login, Signup, User, UserStore, issue_token, verify_token
from ..settings import get_settings

router = APIRouter(prefix="/api/auth", tags=["auth"])


@lru_cache(maxsize=4)
def _user_store_for(db_path: str) -> UserStore:
    return UserStore(db_path)


def get_user_store() -> UserStore:
    return _user_store_for(get_settings().twinverse_db_path)


@router.post("/signup", response_model=AuthResult, status_code=status.HTTP_201_CREATED)
def signup(body: Signup, store: UserStore = Depends(get_user_store)) -> AuthResult:
    if "@" not in body.email or "." not in body.email.rsplit("@", 1)[-1]:
        raise HTTPException(status_code=422, detail="enter a valid email address")
    user = store.create_user(body.email, body.password, body.name)
    if user is None:
        raise HTTPException(status_code=409, detail="an account with this email already exists")
    return AuthResult(token=issue_token(user.id, get_settings()), user=user)


@router.post("/login", response_model=AuthResult)
def login(body: Login, store: UserStore = Depends(get_user_store)) -> AuthResult:
    user = store.verify(body.email, body.password)
    if user is None:
        raise HTTPException(status_code=401, detail="email or password is incorrect")
    return AuthResult(token=issue_token(user.id, get_settings()), user=user)


def current_user(
    authorization: str | None = Header(default=None),
    store: UserStore = Depends(get_user_store),
) -> User:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="sign in required")
    user_id = verify_token(authorization.split(" ", 1)[1].strip(), get_settings())
    user = store.get_user(user_id) if user_id else None
    if user is None:
        raise HTTPException(status_code=401, detail="session expired — sign in again")
    return user


@router.get("/me", response_model=User)
def me(user: User = Depends(current_user)) -> User:
    return user
