#!/bin/bash
set -e

# Create log directory
mkdir -p /var/log/supervisor

# If VNC_PASSWORD is set, configure x11vnc to use it
if [ -n "$VNC_PASSWORD" ]; then
    echo "Configuring x11vnc with password..."
    # Update supervisord.conf to use password
    sed -i "s|-nopw|-passwd ${VNC_PASSWORD}|g" /etc/supervisor/conf.d/supervisord.conf
else
    echo "No VNC_PASSWORD set, VNC will be open (no password required)"
fi

echo "Starting supervisord..."
exec /usr/bin/supervisord -n -c /etc/supervisor/conf.d/supervisord.conf
