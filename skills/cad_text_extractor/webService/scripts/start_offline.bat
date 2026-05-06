@echo off
echo Loading Docker images...
docker load -i images\mysql_8_0_20260120.tar
docker load -i images\toolbox_backend_20260120.tar
docker load -i images\toolbox_frontend_20260120.tar

echo Starting services...
docker-compose -f docker-compose.yml up -d --no-build

echo Services started.
pause
