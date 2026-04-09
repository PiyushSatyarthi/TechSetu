import os
import re
import time
import hmac
import json
import base64
import hashlib
import uuid
from urllib.parse import urlencode
from pathlib import Path
from typing import Optional

import razorpay
from fastapi import FastAPI, HTTPException, Response, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, EmailStr, Field, field_validator
from supabase import create_client, Client
from dotenv import load_dotenv


load_dotenv()

APP_ORIGIN = os.getenv("APP_ORIGIN", "http://127.0.0.1:5500")
APP_ORIGINS = os.getenv("APP_ORIGINS", "")
SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY", "")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
RAZORPAY_KEY_ID = os.getenv("RAZORPAY_KEY_ID", "")
RAZORPAY_KEY_SECRET = os.getenv("RAZORPAY_KEY_SECRET", "")

DEV_OTP = "666666"

supabase: Optional[Client] = (
    create_client(SUPABASE_URL, SUPABASE_ANON_KEY)
    if SUPABASE_URL and SUPABASE_ANON_KEY
    else None
)
# Use service role for trusted server-side DB writes that must bypass RLS.
supabase_admin: Optional[Client] = (
    create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    if SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
    else None
)
rzp_client = razorpay.Client(auth=(RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET))
BASE_DIR = Path(__file__).resolve().parent

app = FastAPI(title="TechSetu Backend")

_allowed_origins = [o.strip() for o in APP_ORIGINS.split(",") if o.strip()]
if APP_ORIGIN and APP_ORIGIN not in _allowed_origins:
    _allowed_origins.append(APP_ORIGIN)
for _origin in (
    "http://127.0.0.1:5500",
    "http://localhost:5500",
    "http://127.0.0.1:3000",
    "http://localhost:3000",
):
    if _origin not in _allowed_origins:
        _allowed_origins.append(_origin)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def db_client() -> Client:
    """Return privileged client for server writes when available."""
    client = supabase_admin or supabase
    if not client:
        raise HTTPException(status_code=500, detail="Supabase is not configured.")
    return client


def auth_client() -> Client:
    """Return auth-enabled Supabase client or fail with clear config error."""
    if not supabase:
        raise HTTPException(
            status_code=500,
            detail="Supabase is not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY.",
        )
    return supabase


# ─── MODELS ───

class SignupBody(BaseModel):
    role: str = Field(pattern="^(buyer|farmer)$")
    first_name: str = Field(min_length=2, max_length=50)
    last_name: str = Field(min_length=1, max_length=50)
    email: EmailStr
    password: str = Field(min_length=8, max_length=64)
    phone: str = Field(min_length=10, max_length=20)
    state: Optional[str] = None
    primary_crop: Optional[str] = None
    organisation: Optional[str] = None

    @field_validator("phone")
    @classmethod
    def validate_phone(cls, value: str) -> str:
        cleaned = value.strip()
        if not re.fullmatch(r"^\+?[0-9\s-]{10,20}$", cleaned):
            raise ValueError("Invalid phone number format.")
        return cleaned

    @field_validator("password")
    @classmethod
    def validate_password(cls, value: str) -> str:
        if (
            not re.search(r"[A-Z]", value)
            or not re.search(r"[a-z]", value)
            or not re.search(r"[0-9]", value)
        ):
            raise ValueError("Password must include uppercase, lowercase, and a number.")
        return value


class LoginBody(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=64)
    expected_role: Optional[str] = Field(default=None, pattern="^(buyer|farmer)$")


class VerifyPhoneBody(BaseModel):
    phone: str
    otp: str


class GoogleOAuthStartBody(BaseModel):
    role: str = Field(default="buyer", pattern="^(buyer|farmer)$")


class GoogleOAuthExchangeBody(BaseModel):
    auth_code: str = Field(min_length=1)
    redirect_to: Optional[str] = None


class ForgotPasswordBody(BaseModel):
    email: EmailStr
    role: Optional[str] = Field(default="buyer", pattern="^(buyer|farmer)$")
    redirect_to: Optional[str] = None


class RazorpayOrderBody(BaseModel):
    amount_inr: int = Field(gt=0, le=500000)


class VerifyPaymentBody(BaseModel):
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str


class UpdateProfileBody(BaseModel):
    first_name: str = Field(min_length=2, max_length=50)
    last_name: str = Field(min_length=1, max_length=50)
    phone: str = Field(min_length=10, max_length=20)
    state: Optional[str] = None
    primary_crop: Optional[str] = None
    organisation: Optional[str] = None

    @field_validator("phone")
    @classmethod
    def validate_phone(cls, value: str) -> str:
        cleaned = value.strip()
        if not re.fullmatch(r"^\+?[0-9\s-]{10,20}$", cleaned):
            raise ValueError("Invalid phone number format.")
        return cleaned


class ChangePasswordBody(BaseModel):
    new_password: str = Field(min_length=8, max_length=64)

    @field_validator("new_password")
    @classmethod
    def validate_password(cls, value: str) -> str:
        if (
            not re.search(r"[A-Z]", value)
            or not re.search(r"[a-z]", value)
            or not re.search(r"[0-9]", value)
        ):
            raise ValueError("Password must include uppercase, lowercase, and a number.")
        return value


# ─── AUTH HELPERS ───

def _get_user_from_token(request: Request) -> dict:
    """Validate Supabase JWT from Authorization header."""
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated.")
    token = auth_header[7:]
    try:
        user_res = auth_client().auth.get_user(token)
        if not user_res or not user_res.user:
            raise HTTPException(status_code=401, detail="Invalid or expired token.")
        return {"uid": user_res.user.id, "email": user_res.user.email}
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired token.")


# ─── ROUTES ───

@app.get("/health")
def health() -> dict:
    return {"ok": True}


@app.get("/")
def app_root() -> FileResponse:
    return FileResponse(BASE_DIR / "index.html")


@app.get("/index.html")
def app_index() -> FileResponse:
    return FileResponse(BASE_DIR / "index.html")


@app.get("/app.js")
def app_js() -> FileResponse:
    return FileResponse(BASE_DIR / "app.js", media_type="application/javascript")


@app.get("/styles.css")
def app_css() -> FileResponse:
    return FileResponse(BASE_DIR / "styles.css", media_type="text/css")


@app.get("/request-transport.html")
def app_transport() -> FileResponse:
    return FileResponse(BASE_DIR / "request-transport.html")


# ── 1. Phone OTP verification (dev mode) ──

@app.post("/auth/verify-phone")
def verify_phone(body: VerifyPhoneBody) -> dict:
    if body.otp != DEV_OTP:
        raise HTTPException(
            status_code=400,
            detail={
                "error_code": "INVALID_OTP",
                "detail": "Invalid OTP. Please try again.",
            },
        )
    return {"ok": True, "message": "Phone verified."}


# ── Signup ──

@app.post("/auth/signup")
def signup(body: SignupBody) -> dict:
    if body.role == "farmer" and (not body.state or not body.primary_crop):
        raise HTTPException(
            status_code=400,
            detail={
                "error_code": "MISSING_FARMER_FIELDS",
                "detail": "State and primary crop are required for farmers.",
            },
        )
    if body.role == "buyer" and not body.organisation:
        raise HTTPException(
            status_code=400,
            detail={
                "error_code": "MISSING_BUYER_ORGANISATION",
                "detail": "Organisation is required for buyers.",
            },
        )

    metadata = {
        "role": body.role,
        "first_name": body.first_name.strip(),
        "last_name": body.last_name.strip(),
        "phone": body.phone.strip(),
    }
    try:
        auth_res = auth_client().auth.sign_up(
            {
                "email": body.email,
                "password": body.password,
                "options": {"data": metadata},
            }
        )
    except Exception as exc:
        message = str(exc)
        lower = message.lower()
        if "already registered" in lower or "already been registered" in lower:
            raise HTTPException(
                status_code=409,
                detail={
                    "error_code": "EMAIL_ALREADY_REGISTERED",
                    "detail": "This email is already registered. Please sign in instead.",
                },
            )
        if "database error saving new user" in lower:
            raise HTTPException(
                status_code=500,
                detail={
                    "error_code": "AUTH_DB_SAVE_FAILED",
                    "detail": (
                        "Supabase could not save the new user. "
                        "Check Auth settings, user-related DB triggers, and constraints."
                    ),
                },
            )
        raise HTTPException(
            status_code=400,
            detail={
                "error_code": "SIGNUP_FAILED",
                "detail": message,
            },
        )
    user = auth_res.user
    if not user:
        raise HTTPException(
            status_code=400,
            detail={
                "error_code": "SIGNUP_USER_NOT_CREATED",
                "detail": "Sign-up failed. Email may already exist.",
            },
        )

    # ── 3. Insert into profiles table ──
    profile_row = {
        "id": user.id,
        "role": body.role,
        "first_name": body.first_name.strip(),
        "last_name": body.last_name.strip(),
        "phone": body.phone.strip(),
        "state": (body.state or "").strip(),
        "primary_crop": (body.primary_crop or "").strip(),
        "organisation": (body.organisation or "").strip(),
    }
    try:
        db_client().table("profiles").insert(profile_row).execute()
    except Exception as exc:
        # Roll back auth user if profile write fails so frontend can retry cleanly.
        if supabase_admin:
            try:
                supabase_admin.auth.admin.delete_user(user.id)
            except Exception:
                pass
        raise HTTPException(
            status_code=500,
            detail={
                "error_code": "SIGNUP_PROFILE_WRITE_FAILED",
                "detail": (
                    "Unable to create user profile. "
                    "Configure SUPABASE_SERVICE_ROLE_KEY or update RLS policy for profiles inserts."
                ),
            },
        ) from exc

    # Return access_token from session if available (email confirmation may be off)
    session = auth_res.session
    access_token = session.access_token if session else None

    return {
        "ok": True,
        "access_token": access_token,
        "user": {"id": user.id, "email": body.email, "role": body.role},
    }


# ── 4. Login — return Supabase JWT ──

@app.post("/auth/login")
def login(body: LoginBody) -> dict:
    try:
        auth_res = auth_client().auth.sign_in_with_password({"email": body.email, "password": body.password})
    except Exception as exc:
        message = str(exc)
        lower = message.lower()
        if "email not confirmed" in lower:
            raise HTTPException(
                status_code=403,
                detail={
                    "error_code": "EMAIL_NOT_CONFIRMED",
                    "detail": "Email not confirmed. Please verify your email before logging in.",
                },
            )
        if "invalid login credentials" in lower:
            raise HTTPException(
                status_code=401,
                detail={
                    "error_code": "INVALID_CREDENTIALS",
                    "detail": "Invalid email or password.",
                },
            )
        raise HTTPException(
            status_code=400,
            detail={
                "error_code": "LOGIN_FAILED",
                "detail": message,
            },
        )

    user = auth_res.user
    session = auth_res.session
    if not user or not session or not session.access_token:
        raise HTTPException(
            status_code=401,
            detail={
                "error_code": "INVALID_CREDENTIALS",
                "detail": "Invalid email or password.",
            },
        )

    role = (user.user_metadata or {}).get("role", "buyer")
    if body.expected_role and role != body.expected_role:
        raise HTTPException(
            status_code=403,
            detail={
                "error_code": "ROLE_MISMATCH",
                "detail": (
                    f"This account is registered as {role}. "
                    f"Please use the {role} login option."
                ),
                "expected_role": body.expected_role,
                "actual_role": role,
            },
        )

    access_token = session.access_token
    return {
        "ok": True,
        "access_token": access_token,
        "user": {"id": user.id, "email": body.email, "role": role},
    }


@app.post("/auth/logout")
def logout() -> dict:
    return {"ok": True}


@app.post("/auth/forgot-password")
def forgot_password(body: ForgotPasswordBody, request: Request) -> dict:
    origin = request.headers.get("origin") or APP_ORIGIN
    fallback_role = body.role or "buyer"
    redirect_to = body.redirect_to or f"{origin.rstrip('/')}/index.html?oauth_role={fallback_role}"
    auth_api = auth_client().auth

    reset_fn = getattr(auth_api, "reset_password_email", None)
    if not callable(reset_fn):
        reset_fn = getattr(auth_api, "reset_password_for_email", None)
    if not callable(reset_fn):
        raise HTTPException(
            status_code=500,
            detail={
                "error_code": "PASSWORD_RESET_UNAVAILABLE",
                "detail": "Password reset API is unavailable in current Supabase SDK version.",
            },
        )

    try:
        try:
            reset_fn(body.email, {"redirect_to": redirect_to})
        except TypeError:
            reset_fn(body.email)
    except Exception as exc:
        raise HTTPException(
            status_code=400,
            detail={
                "error_code": "PASSWORD_RESET_EMAIL_FAILED",
                "detail": "Could not send password reset email. Please try again.",
            },
        ) from exc

    return {"ok": True, "message": "Password reset email sent."}


@app.post("/auth/google/start")
def google_oauth_start(body: GoogleOAuthStartBody, request: Request) -> dict:
    role = body.role or "buyer"
    origin = request.headers.get("origin") or APP_ORIGIN
    redirect_to = f"{origin.rstrip('/')}/index.html?oauth_role={role}"
    if not SUPABASE_URL:
        raise HTTPException(
            status_code=500,
            detail={
                "error_code": "OAUTH_START_FAILED",
                "detail": "Supabase URL is not configured.",
            },
        )

    # Build authorize URL directly so callback can return access_token without
    # server-side PKCE verifier dependency in serverless runtimes.
    query = urlencode({
        "provider": "google",
        "redirect_to": redirect_to,
    })
    auth_url = f"{SUPABASE_URL.rstrip('/')}/auth/v1/authorize?{query}"

    return {"ok": True, "url": auth_url}


@app.post("/auth/google/exchange")
def google_oauth_exchange(body: GoogleOAuthExchangeBody) -> dict:
    try:
        auth_res = auth_client().auth.exchange_code_for_session(
            {
                "auth_code": body.auth_code,
                "redirect_to": body.redirect_to,
            }
        )
    except Exception as exc:
        raise HTTPException(
            status_code=400,
            detail={
                "error_code": "OAUTH_EXCHANGE_FAILED",
                "detail": "Unable to exchange OAuth code. Please retry Google login.",
            },
        ) from exc

    session = auth_res.session
    user = auth_res.user
    if not session or not session.access_token:
        raise HTTPException(
            status_code=401,
            detail={
                "error_code": "OAUTH_TOKEN_MISSING",
                "detail": "OAuth exchange did not return an access token.",
            },
        )

    role = (user.user_metadata or {}).get("role", "buyer") if user else "buyer"
    return {
        "ok": True,
        "access_token": session.access_token,
        "user": {
            "id": user.id if user else None,
            "email": user.email if user else None,
            "role": role,
        },
    }


@app.get("/auth/me")
def me(request: Request) -> dict:
    session = _get_user_from_token(request)
    return {"ok": True, "session": session}


@app.get("/auth/profile")
def get_profile(request: Request) -> dict:
    session = _get_user_from_token(request)
    try:
        profile_res = db_client().table("profiles").select(
            "id, role, first_name, last_name, phone, state, primary_crop, organisation"
        ).eq("id", session["uid"]).single().execute()
        profile = profile_res.data
        if not profile:
            raise HTTPException(
                status_code=404,
                detail={
                    "error_code": "PROFILE_NOT_FOUND",
                    "detail": "Profile not found for this account.",
                },
            )
        profile["email"] = session.get("email")
        return {"ok": True, "profile": profile}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail={
                "error_code": "PROFILE_FETCH_FAILED",
                "detail": "Could not fetch profile details.",
            },
        ) from exc


@app.patch("/auth/profile")
def update_profile(body: UpdateProfileBody, request: Request) -> dict:
    session = _get_user_from_token(request)
    try:
        existing_res = db_client().table("profiles").select("id, role").eq(
            "id", session["uid"]
        ).single().execute()
        existing = existing_res.data
        if not existing:
            raise HTTPException(
                status_code=404,
                detail={
                    "error_code": "PROFILE_NOT_FOUND",
                    "detail": "Profile not found for this account.",
                },
            )

        role = existing.get("role", "buyer")
        if role == "farmer" and (not body.state or not body.primary_crop):
            raise HTTPException(
                status_code=400,
                detail={
                    "error_code": "MISSING_FARMER_FIELDS",
                    "detail": "State and primary crop are required for farmers.",
                },
            )
        if role == "buyer" and not body.organisation:
            raise HTTPException(
                status_code=400,
                detail={
                    "error_code": "MISSING_BUYER_ORGANISATION",
                    "detail": "Organisation is required for customers.",
                },
            )

        patch_data = {
            "first_name": body.first_name.strip(),
            "last_name": body.last_name.strip(),
            "phone": body.phone.strip(),
            "state": (body.state or "").strip(),
            "primary_crop": (body.primary_crop or "").strip(),
            "organisation": (body.organisation or "").strip(),
        }
        profile_res = db_client().table("profiles").update(patch_data).eq(
            "id", session["uid"]
        ).execute()
        updated = profile_res.data[0] if profile_res.data else None
        return {"ok": True, "profile": updated}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail={
                "error_code": "PROFILE_UPDATE_FAILED",
                "detail": "Could not update profile.",
            },
        ) from exc


@app.post("/auth/change-password")
def change_password(body: ChangePasswordBody, request: Request) -> dict:
    session = _get_user_from_token(request)
    if not supabase_admin:
        raise HTTPException(
            status_code=500,
            detail={
                "error_code": "PASSWORD_CHANGE_UNAVAILABLE",
                "detail": "Password change is unavailable. Configure SUPABASE_SERVICE_ROLE_KEY.",
            },
        )
    try:
        supabase_admin.auth.admin.update_user_by_id(
            session["uid"],
            {"password": body.new_password},
        )
        return {"ok": True, "message": "Password updated successfully."}
    except Exception as exc:
        raise HTTPException(
            status_code=400,
            detail={
                "error_code": "PASSWORD_CHANGE_FAILED",
                "detail": "Unable to change password. Please try again.",
            },
        ) from exc


# ── 5. Payments — with order storage ──

@app.post("/payments/create-order")
def create_order(body: RazorpayOrderBody, request: Request) -> dict:
    sess = _get_user_from_token(request)
    if not RAZORPAY_KEY_ID or not RAZORPAY_KEY_SECRET:
        raise HTTPException(status_code=500, detail="Razorpay keys not configured.")

    amount_paise = body.amount_inr * 100
    order = rzp_client.order.create(
        {
            "amount": amount_paise,
            "currency": "INR",
            "payment_capture": 1,
        }
    )

    # Store order in DB. Use a status accepted by DB constraint.
    try:
        db_client().table("orders").insert({
            "user_id": sess["uid"],
            "razorpay_order_id": order["id"],
            "amount": body.amount_inr,
            "status": "pending",
        }).execute()
    except Exception as exc:
        message = str(exc)
        if "orders_status_check" in message:
            raise HTTPException(
                status_code=500,
                detail="Order status constraint failed. Update allowed statuses or use 'pending'/'paid'.",
            )
        raise HTTPException(status_code=500, detail="Unable to persist order in database.") from exc

    return {"ok": True, "order": order, "key_id": RAZORPAY_KEY_ID}


@app.post("/payments/verify")
def verify_payment(body: VerifyPaymentBody, request: Request) -> dict:
    _ = _get_user_from_token(request)
    if not RAZORPAY_KEY_SECRET:
        raise HTTPException(status_code=500, detail="Razorpay keys not configured.")

    payload = f"{body.razorpay_order_id}|{body.razorpay_payment_id}"
    expected = hmac.new(RAZORPAY_KEY_SECRET.encode(), payload.encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, body.razorpay_signature):
        raise HTTPException(status_code=400, detail="Payment signature verification failed.")

    # Update order status to paid
    db_client().table("orders").update({"status": "paid"}).eq(
        "razorpay_order_id", body.razorpay_order_id
    ).execute()

    return {"ok": True, "message": "Payment verified."}