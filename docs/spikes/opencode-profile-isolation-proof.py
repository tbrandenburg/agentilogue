#!/usr/bin/env python3
"""Disposable OpenCode profile/session boundary probe; no provider credentials needed."""

from __future__ import annotations

import base64
import json
import os
import pathlib
import socket
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request


PASSWORD = "disposable-profile-proof-only"
FAILURES: list[str] = []
INCONCLUSIVE: list[str] = []


def request(url: str, *, auth: bool = True, method: str = "GET", data: object = None, headers: dict[str, str] | None = None) -> tuple[int, bytes, dict[str, str]]:
    request_headers = dict(headers or {})
    if auth:
        token = base64.b64encode(f"opencode:{PASSWORD}".encode()).decode()
        request_headers["Authorization"] = f"Basic {token}"
    body = json.dumps(data).encode() if data is not None else None
    if body is not None:
        request_headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=body, headers=request_headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=4) as response:
            return response.status, response.read(), dict(response.headers.items())
    except urllib.error.HTTPError as error:
        return error.code, error.read(), dict(error.headers.items())
    except (TimeoutError, socket.timeout) as error:
        return 0, str(error).encode(), {}
    except urllib.error.URLError as error:
        if isinstance(error.reason, (TimeoutError, socket.timeout)):
            return 0, str(error).encode(), {}
        raise


def listener_pids(port: int) -> set[int]:
    inodes: set[str] = set()
    for table in (pathlib.Path("/proc/net/tcp"), pathlib.Path("/proc/net/tcp6")):
        try:
            rows = table.read_text(encoding="ascii").splitlines()[1:]
        except OSError as error:
            raise RuntimeError(f"cannot inspect listener ownership: {error}") from error
        inodes.update(row.split()[9] for row in rows if len(row.split()) > 9 and row.split()[1].rsplit(":", 1)[-1] == f"{port:04X}" and row.split()[3] == "0A")
    owners: set[int] = set()
    for proc in pathlib.Path("/proc").glob("[0-9]*"):
        try:
            for fd in (proc / "fd").iterdir():
                try:
                    target = os.readlink(fd)
                except OSError:
                    continue
                if target.startswith("socket:[") and target[8:-1] in inodes:
                    owners.add(int(proc.name))
                    break
        except OSError:
            continue
    return owners


def select_ports() -> tuple[int, int]:
    sockets: list[socket.socket] = []
    try:
        for _ in range(2):
            probe = socket.socket()
            probe.bind(("127.0.0.1", 0))
            sockets.append(probe)
        ports = tuple(int(probe.getsockname()[1]) for probe in sockets)
    finally:
        for probe in sockets:
            probe.close()
    if len(set(ports)) != 2:
        raise RuntimeError("OS did not provide two distinct free ports")
    for port in ports:
        if listener_pids(port):
            raise RuntimeError(f"preflight refused occupied port {port}; no server started or request sent")
    return ports


def start_server(project: pathlib.Path, profile: pathlib.Path, port: int) -> subprocess.Popen[bytes]:
    env = {
        "PATH": os.environ["PATH"],
        "HOME": str(profile / "home"),
        "XDG_DATA_HOME": str(profile / "data"),
        "XDG_CONFIG_HOME": str(profile / "config"),
        "XDG_STATE_HOME": str(profile / "state"),
        "XDG_CACHE_HOME": str(profile / "cache"),
        "OPENCODE_SERVER_PASSWORD": PASSWORD,
        "OPENCODE_SERVER_USERNAME": "opencode",
    }
    (profile / "home").mkdir(parents=True, exist_ok=True)
    return subprocess.Popen(
        ["opencode", "serve", "--hostname", "127.0.0.1", "--port", str(port), "--log-level", "ERROR"],
        cwd=project,
        env=env,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.PIPE,
    )


def wait_for_server(process: subprocess.Popen[bytes], url: str, port: int) -> None:
    for _ in range(80):
        if process.poll() is not None:
            raise RuntimeError(f"OpenCode exited with status {process.returncode}")
        owners = listener_pids(port)
        if owners and owners != {process.pid}:
            raise RuntimeError(f"port {port} belongs to unexpected PID(s) {sorted(owners)}; no readiness/API request sent")
        if process.pid in owners:
            try:
                status, _, _ = request(f"{url}/global/health", auth=False)
                if status in (200, 401):
                    return
            except urllib.error.URLError:
                pass
        time.sleep(0.25)
    raise TimeoutError("owned OpenCode listener did not become ready")


def check(label: str, condition: bool, detail: str) -> None:
    print(f"{'PASS' if condition else 'FAIL'} {label}: {detail}")
    if not condition:
        FAILURES.append(label)
        if "status=0" in detail:
            INCONCLUSIVE.append(f"{label} request timed out")


def main() -> int:
    processes: list[subprocess.Popen[bytes]] = []
    ports: tuple[int, int] | None = None
    try:
        ports = select_ports()
        print(f"selected_ports={ports}")
        with tempfile.TemporaryDirectory(prefix="issue-33-opencode-") as temporary:
            root = pathlib.Path(temporary)
            projects = [root / "project-a", root / "project-b"]
            profiles = [root / "profile-a", root / "profile-b"]
            for name, project, profile in zip(("A_MARKER_ONLY", "B_MARKER_ONLY"), projects, profiles):
                project.mkdir()
                profile.mkdir()
                (project / "fixture.marker").write_text(name, encoding="utf-8")

            for project, profile, port in zip(projects, profiles, ports):
                process = start_server(project, profile, port)
                processes.append(process)
                print(f"owned_server_pid_{'ab'[len(processes) - 1]}={process.pid} port={port}")
                wait_for_server(process, f"http://127.0.0.1:{port}", port)

            bases = [f"http://127.0.0.1:{port}" for port in ports]
            session_ids: list[str] = []
            for index, base in enumerate(bases):
                status, body, _ = request(f"{base}/session", method="POST", data={"title": f"Synthetic project {'AB'[index]} session"})
                check(f"create_{'ab'[index]}", status == 200, f"status={status}")
                if status != 200:
                    raise RuntimeError("synthetic session setup incomplete")
                session_ids.append(json.loads(body)["id"])
            session_a, session_b = session_ids

            for index, base in enumerate(bases):
                own, foreign = ((session_a, session_b) if index == 0 else (session_b, session_a))
                for endpoint in ("/session", "/experimental/session?roots=true&archived=true"):
                    status, body, _ = request(f"{base}{endpoint}")
                    ids = [session["id"] for session in json.loads(body)] if status == 200 else []
                    check(f"list_{'ab'[index]}{endpoint.split('?')[0]}", status == 200 and own in ids and foreign not in ids, f"status={status} own={own in ids} foreign={foreign in ids}")

            base_a = bases[0]
            probes = (
                ("foreign_metadata", f"{base_a}/session/{session_b}", "GET", None, {}),
                ("foreign_messages", f"{base_a}/session/{session_b}/message", "GET", None, {}),
                ("foreign_abort", f"{base_a}/session/{session_b}/abort", "POST", {}, {}),
                ("foreign_delete", f"{base_a}/session/{session_b}", "DELETE", None, {}),
                ("foreign_absolute_path_only", f"{base_a}/file/content?path={urllib.parse.quote(str(projects[1] / 'fixture.marker'), safe='')}", "GET", None, {}),
                ("foreign_directory_header_only", f"{base_a}/file/content?path=fixture.marker", "GET", None, {"x-opencode-directory": str(projects[1])}),
            )
            for label, url, method, data, headers in probes:
                status, body, _ = request(url, method=method, data=data, headers=headers)
                parsed = body.decode(errors="replace")
                marker = "B_MARKER_ONLY" in parsed
                if label == "foreign_abort":
                    try:
                        abort_result = json.loads(body) if status == 200 else None
                    except json.JSONDecodeError:
                        abort_result = None
                    check(label, status == 404 or (status == 200 and abort_result is False), f"status={status} response={abort_result!r}; no active B run, side effect NOT TESTED")
                    print("foreign_abort_active_run_effect=NOT TESTED")
                elif label.startswith("foreign_absolute") or label.startswith("foreign_directory"):
                    detail = f"status={status} mentions_b_marker={marker}"
                    print(f"OBSERVE {label} {detail}")
                    if status == 0 or status >= 500:
                        INCONCLUSIVE.append(f"{label} returned no conclusive boundary result ({detail})")
                        print(f"INCONCLUSIVE {label}: {detail}")
                    else:
                        check(label, not (status == 200 and marker), detail)
                else:
                    check(label, status == 404 and not marker, f"status={status} mentions_b_marker={marker}")

            auth_status, _, _ = request(f"{base_a}/session", auth=False)
            wrong_status, _, _ = request(f"{base_a}/session", auth=False, headers={"Authorization": "Basic Zm9vOmJhcg=="})
            origin_status, _, origin_headers = request(f"{base_a}/session", headers={"Origin": "http://127.0.0.1:33999"})
            check("auth", auth_status == 401 and wrong_status == 401, f"missing={auth_status} wrong={wrong_status}")
            print(f"origin_observation status={origin_status} allow_origin={origin_headers.get('Access-Control-Allow-Origin', '<absent>')}")
            if origin_status == 0:
                INCONCLUSIVE.append("origin probe timed out")
    except Exception as error:
        INCONCLUSIVE.append(f"{type(error).__name__}: {error}")
    finally:
        for process in processes:
            if process.poll() is None:
                process.terminate()
        for process in processes:
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=5)
            if process.stderr is not None:
                diagnostic = process.stderr.read().decode(errors="replace")
                if diagnostic:
                    print(f"server_diagnostic={diagnostic[-1000:]}")
        for process in processes:
            if process.poll() is None:
                INCONCLUSIVE.append(f"owned child PID {process.pid} remains running after cleanup")
        if ports is not None:
            for port in ports:
                owners = listener_pids(port)
                if owners:
                    INCONCLUSIVE.append(f"port {port} still has listener PID(s) {sorted(owners)} after cleanup")
                    print(f"cleanup_listener_port={port} pids={sorted(owners)}")
                else:
                    print(f"cleanup_listener_port={port} status=none")

    for item in FAILURES:
        print(f"FAIL {item}", file=sys.stderr)
    for item in INCONCLUSIVE:
        print(f"INCONCLUSIVE {item}", file=sys.stderr)
    outcome = "INCONCLUSIVE" if INCONCLUSIVE else "FAIL" if FAILURES else "PASS"
    print(f"RESULT {outcome} failures={len(FAILURES)} inconclusive={len(INCONCLUSIVE)}")
    return 1 if FAILURES or INCONCLUSIVE else 0


if __name__ == "__main__":
    raise SystemExit(main())
