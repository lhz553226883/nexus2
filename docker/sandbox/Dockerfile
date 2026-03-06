# Nexus Local Sandbox Image
# Provides: Shell + File I/O + Browser (Chrome) + VNC GUI
# Compatible with whitezxj/sandbox:0.1.0 interface
FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive
ENV DISPLAY=:99
ENV VNC_PORT=5900
ENV NOVNC_PORT=6080
ENV RESOLUTION=1280x800x24
ENV LANG=en_US.UTF-8
ENV LANGUAGE=en_US:en
ENV LC_ALL=en_US.UTF-8

# ── 1. System base ────────────────────────────────────────────────────────────
RUN apt-get update && apt-get install -y --no-install-recommends \
    # Locale
    locales \
    # X virtual framebuffer & VNC
    xvfb \
    x11vnc \
    # noVNC dependencies
    python3 python3-pip python3-numpy \
    websockify \
    git \
    # Desktop environment (lightweight openbox)
    openbox \
    obconf \
    # Chrome dependencies (including Vulkan support)
    wget curl gnupg ca-certificates \
    fonts-liberation libappindicator3-1 libasound2 libatk-bridge2.0-0 \
    libatk1.0-0 libcairo2 libcups2 libdbus-1-3 libexpat1 libfontconfig1 \
    libgbm1 libgcc1 libglib2.0-0 libgtk-3-0 libnspr4 libnss3 \
    libpango-1.0-0 libpangocairo-1.0-0 libstdc++6 libx11-6 libx11-xcb1 \
    libxcb1 libxcomposite1 libxcursor1 libxdamage1 libxext6 libxfixes3 \
    libxi6 libxrandr2 libxrender1 libxss1 libxtst6 lsb-release xdg-utils \
    # Vulkan and additional graphics libraries (FIX for Chrome dependency)
    libvulkan1 libvulkan-dev \
    libxkbcommon0 libxkbcommon-x11-0 \
    libdrm2 libdrm-common \
    # Process management
    supervisor \
    # Utilities
    tmux curl wget unzip tar gzip net-tools procps \
    # Screenshot and image tools
    scrot imagemagick \
    && locale-gen en_US.UTF-8 \
    && rm -rf /var/lib/apt/lists/*

# ── 2. Install Google Chrome ──────────────────────────────────────────────────
RUN apt-get update && apt-get install -y --no-install-recommends \
    && wget -q -O /tmp/chrome.deb \
    https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb \
    && apt-get install -y /tmp/chrome.deb \
    && rm /tmp/chrome.deb \
    && rm -rf /var/lib/apt/lists/*

# ── 3. Install noVNC with optimized download ──────────────────────────────────
# Using curl with connection pooling and parallel streams for faster download
RUN mkdir -p /opt/novnc && \
    curl -L --max-time 300 --connect-timeout 30 -o /tmp/novnc.tar.gz \
    https://codeload.github.com/novnc/noVNC/tar.gz/refs/tags/v1.4.0 && \
    tar -xzf /tmp/novnc.tar.gz -C /opt/novnc --strip-components=1 && \
    ln -s /opt/novnc/vnc.html /opt/novnc/index.html && \
    rm /tmp/novnc.tar.gz

# ── 4. Python packages ────────────────────────────────────────────────────────
RUN pip3 install --no-cache-dir \
    websockify \
    requests \
    playwright

# ── 5. supervisord configuration ─────────────────────────────────────────────
COPY supervisord.conf /etc/supervisor/conf.d/supervisord.conf

# ── 6. Startup script ─────────────────────────────────────────────────────────
COPY start.sh /start.sh
RUN chmod +x /start.sh

# ── 7. Openbox config (minimal, no decorations) ───────────────────────────────
RUN mkdir -p /root/.config/openbox
COPY openbox-rc.xml /root/.config/openbox/rc.xml

WORKDIR /workspace

EXPOSE 5900 6080

CMD ["/start.sh"]
