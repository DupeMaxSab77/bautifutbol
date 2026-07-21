# StreamHub - Player Universal

Reproductor web que soporta **HLS (M3U8)** y **MPEG-DASH (MPD)** con más de **300 canales**.

## Características

-   Reproduce M3U8 con hls.js
-   Reproduce MPD con shaka-player (incluye soporte DRM Clearkey)
-   Buscador de canales en vivo
-   Interfaz responsive
-   Lista de canales actualizable con un click

## Fuentes incluidas

-   190.108.83.69:8000 (201 canales M3U8)
-   181.224.200.5:2277 (47 canales M3U8)
-   la20hd.com (20 canales M3U8 con token)
-   fltvhd.com (20 canales M3U8 con token)
-   telelibrefull.online (29 canales MPD)

Total: **317 canales** (288 M3U8 + 29 MPD)

## Deploy en Render

1.  Forkeá este repo en GitHub
2.  En [Render](https://render.com), creá un nuevo **Web Service**
3.  Conectá tu repo de GitHub
4.  Configuración:
    -   **Name**: `streamhub` (o el que quieras)
    -   **Environment**: `Docker`
    -   **Branch**: `main`
    -   No hace falta más nada, el Dockerfile ya está configurado
5.  Click en **Create Web Service**

## Deploy en Railway / Fly.io / cualquier hosting

```bash
docker build -t streamhub .
docker run -p 80:80 streamhub
```

## Actualizar canales

Los canales están en `channels/channels.json`. Para actualizarlos, corré el scraper:

```bash
# (opcional) refrescar tokens de la20hd y fltvhd
bash refresh.sh
```

Después rebuild del contenedor.

## Stack

-   [hls.js](https://github.com/video-dev/hls.js)
-   [shaka-player](https://github.com/shaka-project/shaka-player)
-   Nginx Alpine
-   Docker

## Nota

Los streams MPD requieren que el navegador soporte Encrypted Media Extensions (EME) para DRM Clearkey. Chrome y Edge funcionan bien. Los tokens de la20hd y fltvhd expiran cada ~6 horas.
