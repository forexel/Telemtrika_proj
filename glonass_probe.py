#!/usr/bin/env python3
"""Минимальный клиент для первичной проверки API MSS GLONASS."""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parent
DEFAULT_LOGIN_URL = "http://api.mssglonass.ru/api/vm/login.php"
SECRET_KEYS = {"apikey", "key", "pwd", "pwd_md5", "password"}


def load_env(path: Path) -> None:
    """Загрузить простой KEY=VALUE файл, не заменяя переменные окружения."""
    if not path.exists():
        return
    for line_number, raw_line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if "=" not in line:
            raise ValueError(f"{path}:{line_number}: ожидается строка KEY=VALUE")
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in {'\"', "'"}:
            value = value[1:-1]
        os.environ.setdefault(key, value)


def env(name: str, *, required: bool = False) -> str | None:
    value = os.environ.get(name, "").strip()
    if required and not value:
        raise ValueError(f"Не задано {name}. Заполните .env по образцу .env.example")
    return value or None


def safe_params(params: dict[str, Any]) -> dict[str, Any]:
    return {
        key: ("***" if key in SECRET_KEYS and value else value)
        for key, value in params.items()
    }


def redact_data(value: Any) -> Any:
    """Рекурсивно скрыть секреты, которые API может вернуть в теле ответа."""
    if isinstance(value, dict):
        return {
            key: ("***" if key.lower() in SECRET_KEYS and item not in (None, "") else redact_data(item))
            for key, item in value.items()
        }
    if isinstance(value, list):
        return [redact_data(item) for item in value]
    return value


def request_json_or_text(url: str, params: dict[str, Any], timeout: float) -> tuple[int, Any]:
    clean_params = {key: value for key, value in params.items() if value not in (None, "")}
    request_url = f"{url}?{urlencode(clean_params)}"
    request = Request(request_url, headers={"Accept": "application/json", "User-Agent": "glonass-api-probe/1.0"})

    print(f"GET {url}")
    print("Параметры:", json.dumps(safe_params(clean_params), ensure_ascii=False))

    try:
        with urlopen(request, timeout=timeout) as response:
            status = response.status
            content_type = response.headers.get("Content-Type", "")
            raw = response.read()
    except HTTPError as error:
        status = error.code
        content_type = error.headers.get("Content-Type", "") if error.headers else ""
        raw = error.read()
    except URLError as error:
        reason = getattr(error, "reason", "неизвестная сетевая ошибка")
        raise RuntimeError(f"Не удалось подключиться к API: {reason}") from None

    charset = "utf-8"
    if "charset=" in content_type.lower():
        charset = content_type.lower().split("charset=", 1)[1].split(";", 1)[0].strip()
    text = raw.decode(charset, errors="replace")
    try:
        body: Any = json.loads(text)
    except json.JSONDecodeError:
        body = text
    return status, body


def print_response(status: int, body: Any) -> None:
    print(f"HTTP {status}")
    body = redact_data(body)
    if isinstance(body, (dict, list)):
        print(json.dumps(body, ensure_ascii=False, indent=2))
    else:
        print(body)


def login(args: argparse.Namespace) -> int:
    login_value = env("GLONASS_USERNAME", required=True)
    params = {
        "apikey": env("GLONASS_API_KEY", required=True),
        ("user_id" if args.as_user_id else "name"): login_value,
        "pwd": env("GLONASS_PASSWORD", required=True),
        "indented": "true",
        "parse_params": "true",
    }
    if args.all:
        params["add"] = "all,no_all_user"
    status, body = request_json_or_text(
        env("GLONASS_LOGIN_URL") or DEFAULT_LOGIN_URL,
        params,
        args.timeout,
    )
    print_response(status, body)
    return 0 if 200 <= status < 300 else 1


def position(args: argparse.Namespace) -> int:
    server = (args.server or env("GLONASS_SERVER", required=True)).strip()
    server = server.removeprefix("http://").removeprefix("https://").rstrip("/")
    if server.endswith(":2231"):
        server = server[:-5]
    params = {
        "apikey": env("GLONASS_API_KEY", required=True),
        "userID": env("GLONASS_USER_ID", required=True),
        "pwd": env("GLONASS_PASSWORD", required=True),
        "unitIDs": args.unit_ids,
        "dt": args.dt,
        "add": args.add,
        "params": "indented,dtAsString",
    }
    status, body = request_json_or_text(
        f"http://{server}:2231/vm/position",
        params,
        args.timeout,
    )
    print_response(status, body)
    return 0 if 200 <= status < 300 else 1


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Пробные запросы к MSS GLONASS API")
    parser.add_argument("--env-file", type=Path, default=ROOT / ".env")
    parser.add_argument(
        "--timeout",
        type=float,
        default=float(os.environ.get("GLONASS_TIMEOUT_SECONDS", "30")),
        help="таймаут запроса в секундах (по умолчанию: 30)",
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    login_parser = subparsers.add_parser("login", help="получить пользователя и список устройств")
    login_parser.add_argument(
        "--all",
        action="store_true",
        help="запросить все доступные элементы клиента (ответ будет заметно больше)",
    )
    login_parser.add_argument(
        "--as-user-id",
        action="store_true",
        help="передать GLONASS_USERNAME как числовой user_id, а не как name",
    )
    login_parser.set_defaults(handler=login)

    position_parser = subparsers.add_parser("position", help="получить текущее положение машин")
    position_parser.add_argument("--server", help="сервер из login-ответа, без порта")
    position_parser.add_argument(
        "--unit-ids",
        required=True,
        help="ID одной/нескольких машин через запятую (обязателен, чтобы случайно не запросить весь парк)",
    )
    position_parser.add_argument("--dt", help="момент времени; без параметра — текущий")
    position_parser.add_argument(
        "--add",
        default="move,address,moveCalc,fuelLevel,states",
        help="дополнительные наборы полей",
    )
    position_parser.set_defaults(handler=position)
    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    try:
        load_env(args.env_file)
        # Таймаут из .env читается после загрузки файла, если CLI его не менял.
        if args.timeout == 30 and env("GLONASS_TIMEOUT_SECONDS"):
            args.timeout = float(env("GLONASS_TIMEOUT_SECONDS") or "30")
        return args.handler(args)
    except (ValueError, RuntimeError) as error:
        print(f"Ошибка: {error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
