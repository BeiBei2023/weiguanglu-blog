#!/usr/bin/env python3
"""机器体检采样：每次一行 JSON，追加到 data/health.jsonl。

由 systemd timer（blog-health.timer）每小时调用一次。
只读 /proc、/sys/class/hwmon、df、lsblk、smartctl；除 health.jsonl 外不写任何东西。
"""
import datetime
import json
import os
import subprocess
import tempfile

OUT = os.environ.get("OUT", "/srv/blog/data/health.jsonl")
KEEP = int(os.environ.get("KEEP", "4000"))
DATA_DIR = os.path.dirname(OUT)


def run(cmd, timeout=25):
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
        return result.stdout
    except Exception:
        return ""


def read_meminfo():
    info = {}
    try:
        with open("/proc/meminfo", encoding="utf-8") as handle:
            for line in handle:
                key, _, rest = line.partition(":")
                values = rest.strip().split()
                if values:
                    info[key.strip()] = int(values[0]) * 1024
    except Exception:
        pass
    return info


def collect_disks():
    disks = []
    for mount in ("/", "/mnt/sdc1", "/mnt/sdb1"):
        if not os.path.isdir(mount):
            continue
        lines = run(["df", "-B1", "--output=size,used,avail,pcent", mount]).splitlines()
        if len(lines) < 2:
            continue
        fields = lines[-1].split()
        if len(fields) < 4:
            continue
        try:
            disks.append({
                "mount": mount,
                "size": int(fields[0]),
                "used": int(fields[1]),
                "avail": int(fields[2]),
                "pct": int(fields[3].replace("%", "")),
            })
        except ValueError:
            continue
    return disks


def collect_smart():
    smart = []
    for row in run(["lsblk", "-dn", "-o", "NAME,TYPE"]).splitlines():
        parts = row.split()
        if len(parts) != 2 or parts[1] != "disk":
            continue
        name = parts[0]
        device = "/dev/" + name
        # 重启后 sdX 字母会变，趋势图按「序列号 / 型号」认盘
        model = run(["lsblk", "-dn", "-o", "MODEL", device]).strip()
        serial = run(["lsblk", "-dn", "-o", "SERIAL", device]).strip()
        raw = run(["smartctl", "-A", "-H", "-j", device])
        if not raw:
            continue
        try:
            info = json.loads(raw)
        except Exception:
            continue
        table = {}
        for item in info.get("ata_smart_attributes", {}).get("table", []):
            table[item.get("name", "")] = item.get("raw", {}).get("value")
        entry = {
            "dev": name,
            "key": serial or f"{model}:{name}",
            "model": model,
            "serial": serial,
            "passed": bool(info.get("smart_status", {}).get("passed")),
            "temp": info.get("temperature", {}).get("current"),
            "hours": table.get("Power_On_Hours"),
            "realloc": table.get("Reallocated_Sector_Ct"),
            "pending": table.get("Current_Pending_Sector"),
            "crc": table.get("UDMA_CRC_Error_Count"),
        }
        smart.append({key: value for key, value in entry.items() if value not in (None, "")})
    return smart


CPU_CHIP_NAMES = ("coretemp", "k10temp", "cpu_thermal", "zenpower")
HWMON_DIR = "/sys/class/hwmon"


def _hwmon_text(base, filename):
    try:
        with open(os.path.join(base, filename), encoding="utf-8") as handle:
            return handle.read().strip()
    except Exception:
        return ""


def collect_temps():
    """读 /sys/class/hwmon 的温度：CPU（coretemp 等）与主板（acpitz 等）。

    直接读内核 sysfs，不依赖 lm-sensors 命令；硬盘温度仍走 SMART（collect_smart）。
    """
    try:
        entries = sorted(os.listdir(HWMON_DIR))
    except Exception:
        return {}

    cpu_package = None
    cpu_cores = []
    board = []
    for entry in entries:
        base = os.path.join(HWMON_DIR, entry)
        name = _hwmon_text(base, "name")
        if not name or name.startswith("nvme"):
            continue  # 硬盘温度走 SMART，别混进主板
        try:
            files = sorted(os.listdir(base))
        except Exception:
            continue
        for filename in files:
            if not filename.startswith("temp") or not filename.endswith("_input"):
                continue
            index = filename[len("temp"):-len("_input")]
            raw = _hwmon_text(base, filename)
            try:
                celsius = round(int(raw) / 1000, 1)
            except ValueError:
                continue
            if name in CPU_CHIP_NAMES:
                label = _hwmon_text(base, "temp" + index + "_label").lower()
                if not label or "package" in label or "tctl" in label or "tdie" in label:
                    if cpu_package is None:
                        cpu_package = celsius
                else:
                    cpu_cores.append(celsius)
            else:
                board.append(celsius)

    out = {}
    if cpu_package is not None:
        out["cpuPackage"] = cpu_package
    if cpu_cores:
        out["cpuCores"] = cpu_cores
    if board:
        out["board"] = board
    return out


def collect_backup():
    try:
        with open(os.path.join(DATA_DIR, "backup-status.json"), encoding="utf-8") as handle:
            status = json.load(handle)
        return {"ok": status.get("ok"), "at": status.get("at") or status.get("finishedAt")}
    except Exception:
        return None


def sample():
    out = {"at": datetime.datetime.now().astimezone().isoformat(timespec="seconds")}

    try:
        with open("/proc/loadavg", encoding="utf-8") as handle:
            parts = handle.read().split()
        out["load"] = [float(value) for value in parts[:3]]
    except Exception:
        pass

    try:
        with open("/proc/uptime", encoding="utf-8") as handle:
            out["uptime"] = int(float(handle.read().split()[0]))
    except Exception:
        pass

    mem = read_meminfo()
    if mem:
        out["memTotal"] = mem.get("MemTotal")
        out["memAvailable"] = mem.get("MemAvailable")

    temps = collect_temps()
    if temps:
        out["temps"] = temps

    disks = collect_disks()
    if disks:
        out["disks"] = disks

    smart = collect_smart()
    if smart:
        out["smart"] = smart

    backup = collect_backup()
    if backup:
        out["backup"] = backup

    return out


def main():
    line = json.dumps(sample(), ensure_ascii=False)
    try:
        with open(OUT, "a", encoding="utf-8") as handle:
            handle.write(line + "\n")
    except Exception:
        return

    try:
        with open(OUT, encoding="utf-8") as handle:
            lines = handle.readlines()
        if len(lines) > KEEP:
            handle, tmp = tempfile.mkstemp(dir=DATA_DIR)
            with os.fdopen(handle, "w", encoding="utf-8") as fh:
                fh.writelines(lines[-KEEP:])
            os.replace(tmp, OUT)
    except Exception:
        pass


if __name__ == "__main__":
    main()
