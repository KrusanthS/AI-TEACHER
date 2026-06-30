# AI Nexus — MERN Stack AI Studio

A full-stack MERN application with AI Chat, AI Image Generation, and multi-scene AI Video Generation, all powered by multi-provider automatic failover architectures.

---

## Features

- **AI Chat** — Multimodal chat powered by Google Gemini 2.0 Flash Lite. Supports text and image uploads. Falls back to OpenRouter (DeepSeek v4 Flash) automatically if Gemini quota is exceeded. Image analysis is Gemini-only (vision required).
- **AI Image Generation** — Generates 1024×1024 images using NVIDIA FLUX.1-dev. The prompt is automatically enhanced by a 3-tier pipeline (OpenRouter → Gemini → local keyword builder) before being sent to NVIDIA. Retried once on failure with a 2-second back-off.
- **Image Gallery** — Persistent gallery of all generated images fetched from MongoDB Atlas, sorted newest-first, with per-image download.
- **AI Video Generation** — Generates a long-form MP4 video from a single text prompt. The prompt is split into 5 scenes, each scene is generated independently through an 8-provider automatic failover chain, then all clips are merged into one final MP4 using FFmpeg. Job is created instantly and polled by the frontend until complete.
- **Video Gallery** — Persistent gallery of all completed videos with inline playback, download, and delete.
- **Responsive Design** — Dark UI built with Vanilla CSS and CSS variables. Sidebar collapses on mobile.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, Vite 8, Vanilla CSS, React Router v7, Axios, Lucide React |
| Backend | Node.js, Express 5 |
| Database | MongoDB Atlas via Mongoose 9 |
| AI — Chat | Google Gemini 2.0 Flash Lite (`@google/generative-ai`) |
| AI — Chat Fallback | OpenRouter API (DeepSeek v4 Flash free model) |
| AI — Prompt Enhancement | OpenRouter → Gemini → local keyword builder |
| AI — Image | NVIDIA FLUX.1-dev (`ai.api.nvidia.com`) |
| AI — Video Scene Backgrounds | Pollinations image API (`image.pollinations.ai`) |
| AI — Video Rendering | JSON2Video (`json2video.com/v2`) — primary working provider |
| AI — Video Fallback Chain | Fal → Runware → Flatkey → Higgsfield → CometAPI → SiliconFlow |
| Video Merging | FFmpeg via `fluent-ffmpeg` + `ffmpeg-static` (bundled binary) |

---

## Project Structure

```
AI-Teacher/
├── backend/
│   ├── config/
│   │   ├── db.js               # MongoDB Atlas connection via Mongoose
│   │   └── videoConfig.js      # 8-provider config, PROVIDER_CHAIN, isFailoverError()
│   ├── controllers/
│   │   ├── chatController.js   # POST /api/chat — calls chatWithGemini
│   │   ├── imageController.js  # POST /api/generate-image — enhance + generate + save
│   │   └── videoController.js  # POST /api/generate-video, GET job, GET list, DELETE
│   ├── models/
│   │   ├── Image.js            # Mongoose schema: prompt, imageUrl, createdAt
│   │   └── Video.js            # Mongoose schema: prompt, videoUrl, status, provider, errorMessage, createdAt
│   ├── routes/
│   │   ├── apiRoutes.js        # Chat, image, health routes
│   │   └── videoRoutes.js      # Video generation and gallery routes
│   ├── services/
│   │   ├── aiService.js        # Gemini chat, 3-tier prompt enhancement, NVIDIA image generation
│   │   └── videoService.js     # 8-provider scene generation, FFmpeg merging, failover logic
│   ├── server.js               # Express app, CORS, middleware, route mounting
│   └── .env                    # Environment variables (not committed)
│
└── frontend/
    └── src/
        ├── components/
        │   ├── ChatWindow.jsx      # Multimodal chat UI with image upload
        │   ├── ImageGenerator.jsx  # Prompt input, 4-step loading messages, result display
        │   ├── ImageCard.jsx       # Single image card with download button
        │   └── Sidebar.jsx         # Navigation with NavLink active state, 5 routes
        ├── pages/
        │   ├── Gallery.jsx         # Image gallery — fetches GET /api/images
        │   ├── VideoGenerate.jsx   # Video prompt input, polling loop, elapsed-time counter
        │   └── VideoGallery.jsx    # Video gallery — list, play, download, delete
        ├── services/
        │   ├── api.js              # Axios client (150s timeout) for chat + image APIs
        │   └── videoApi.js         # Axios client (10s timeout) for video APIs
        ├── App.jsx                 # Router with 5 routes: /, /generate, /gallery, /video-generate, /video-gallery
        └── index.css               # Global CSS variables and all shared styles
```

---

## How Each Feature Works

### AI Chat

1. User types a message or attaches an image in `ChatWindow.jsx`.
2. The file is read via `FileReader.readAsDataURL`, the base64 prefix is stripped, and the raw base64 data plus MIME type are stored in component state.
3. `chatWithAI()` in `api.js` sends `POST /api/chat` with `{ prompt, image, mimeType }`. The Axios client has a 150-second timeout.
4. `chatController.js` calls `chatWithGemini()` in `aiService.js`.
5. `chatWithGemini` tries **Gemini 2.0 Flash Lite** first.
   - If an image is attached, it is passed as `inlineData` inside the content array. Image analysis is Gemini-only — no fallback is attempted.
   - If Gemini fails on a text-only prompt (quota 429 or any error), it falls back to **OpenRouter DeepSeek v4 Flash**. DeepSeek `<think>` reasoning blocks are stripped from the response before returning.
6. The response string is returned to the controller, which wraps it as `{ response }` and sends it back to the frontend. The message is appended to the chat list.

### AI Image Generation

1. User types a prompt in `ImageGenerator.jsx` and clicks the wand button.
2. A `setInterval` cycles through 4 loading step messages ("Analyzing your prompt...", "Enhancing with AI...", "Crafting your masterpiece...", "Finalizing image...") every 4 seconds while waiting.
3. `generateImage()` in `api.js` sends `POST /api/generate-image`.
4. `imageController.js` runs a **3-tier prompt enhancement pipeline**:
   - **Tier 1 — OpenRouter (DeepSeek v4 Flash)**: Calls the `/v1/chat/completions` endpoint with a detailed `SYSTEM_PROMPT` instructing it to act as a FLUX image prompt engineer. The response is sanitized — leading/trailing quotes are stripped, newlines collapsed, and `<think>` blocks removed. A usability check rejects responses that start with refusal phrases.
   - **Tier 2 — Gemini 2.0 Flash Lite**: If OpenRouter fails or times out (30s AbortController), Gemini receives the same `SYSTEM_PROMPT` prepended to the user input. Raced against a 30-second timeout using `Promise.race`.
   - **Tier 3 — Local keyword builder**: If both APIs fail, `buildLocalPrompt()` detects the style keyword in the user's input (anime, cyberpunk, realistic, etc.) from a `STYLE_KEYWORDS` map and appends matching quality tags. Always succeeds without any API call.
5. The enhanced prompt is sent to **NVIDIA FLUX.1-dev** at 1024×1024, 20 steps. The full response body is read as text first to avoid stream consumption issues, then parsed as JSON. Retried once on failure with a 2-second back-off. Timeout is 2 minutes via AbortController.
6. NVIDIA returns `artifacts[0].base64`. The controller stores the image as `data:image/jpeg;base64,...` in MongoDB and returns `{ _id, prompt, createdAt, imageUrl }` — the `imageUrl` is returned from the in-memory value, not the Mongoose document, to guarantee the full base64 string is untouched.

### AI Video Generation

#### Scene splitting (`videoService.js` → `splitIntoScenes`)

The user's prompt is expanded into 5 scene descriptions by appending a cinematic variation hint to each one, cycling through:
1. `wide establishing shot, cinematic`
2. `close-up detail, dramatic lighting`
3. `medium shot, dynamic angle`
4. `aerial view, epic scale`
5. `golden hour lighting, cinematic finish`

Each scene prompt is then passed independently through the provider failover chain.

#### Backend flow

1. `POST /api/generate-video` is received by `videoController.js`.
2. A Video document is immediately created in MongoDB with `status: 'processing'`.
3. The controller responds with `202 { jobId, status: 'processing' }` instantly so the client can begin polling.
4. Generation runs in the background. `videoService.js` calls `generateVideo(prompt, sceneCount=5)`.
5. For each of the 5 scenes, `generateScene(scenePrompt, index)` iterates through **PROVIDER_CHAIN** defined in `videoConfig.js`. Each provider is tried in order; on any error the next provider is tried for that same scene. Already-completed scenes are never re-generated.

   **Provider 1 — Pollinations**: No video API exists — immediately throws to skip to the next provider without wasting time on a timeout.

   **Provider 2 — Fal (`fal-ai/minimax-video`)**: Uses Fal's queue-based API. Submits to `queue.fal.run/{model}`, receives a `request_id`, then polls `status` every 4 seconds until `COMPLETED` or `FAILED`, or the 3-minute timeout is reached. On completion fetches the video from `result.video.url`.

   **Provider 3 — Runware (`runware:101@1`)**: Sends a `videoInference` task array to `api.runware.ai/v1`. Checks `data.errors` in the response body (Runware returns errors inside the body with HTTP 200/400, not as thrown exceptions). On success extracts `videoURL` from the matching `taskUUID`.

   **Provider 4 — JSON2Video (primary working provider)**: Builds an AI image URL from `image.pollinations.ai/prompt/{encoded-scene-prompt}?width=1280&height=720&nologo=true&model=flux`. Creates a JSON2Video movie project with a single `image` element (type `image`, `zoom: 'in'` for Ken Burns motion effect) — this produces a real visual video with the Pollinations-generated AI image as the full-frame background. Polls `GET /v2/movies?project={id}` every 3 seconds until `status === 'done'`, then downloads the MP4 buffer.

   **Provider 5 — Flatkey**: Submits to `api.siliconflow.cn/v1/video/submit` with model `wan-i2v-480p`. Polls `POST /v1/video/status` with the `requestId` every 5 seconds until `status === 'Succeed'`.

   **Provider 6 — Higgsfield**: POSTs to `api.higgsfield.ai/v1/generation` with model `animate_diff`. Polls `GET /v1/generation/{id}` every 5 seconds until `status === 'completed'` or `'success'`.

   **Provider 7 — CometAPI (`cogvideox-5b`)**: POSTs to `api.cometapi.com/v1/videos`. Polls `GET /v1/videos/{taskId}` every 5 seconds until `status === 'success'` or `'completed'`.

   **Provider 8 — SiliconFlow (`Wan-AI/Wan2.1-T2V-14B`)**: Same SiliconFlow endpoint as Flatkey but uses a different model and API key (`SILICONFLOW_API_KEY`). Polls `POST /v1/video/status` every 5 seconds until `status === 'Succeed'`.

6. Each successfully generated scene clip is written to the OS temp directory as `scene-{timestamp}-{index}.mp4`.
7. After all 5 scenes are saved, `mergeClips()` writes an FFmpeg concat list file (with forward-slash paths for cross-platform compatibility) and runs `fluent-ffmpeg` with `-f concat -safe 0 -c copy` to produce a single merged MP4. The `-c copy` flag preserves the original codec, resolution, frame rate, and quality without re-encoding.
8. The merged MP4 is read from disk, all temp files are deleted, and the buffer is base64-encoded.
9. MongoDB is updated to `{ status: 'completed', videoUrl: 'data:video/mp4;base64,...', provider: 'multi-scene' }`.
10. On total failure across all providers for any scene, MongoDB is updated to `{ status: 'failed', errorMessage }` and all temp files are cleaned up.

#### Frontend flow

1. User enters a prompt in `VideoGenerate.jsx` and clicks the video button.
2. `generateVideo()` in `videoApi.js` sends `POST /api/generate-video` (10-second Axios timeout — just for the initial 202 response) and receives `{ jobId }`.
3. `setInterval` polls `GET /api/video-job/{jobId}` every 3 seconds. Maximum 80 polls (~4 minutes ceiling). The `pollRef` stores the interval ID so it can be cleared on completion or unmount.
4. While polling, the UI shows a spinner, "Generating Video...", and a live elapsed-seconds counter after 5 seconds (`pollCount × 3`).
5. When job status becomes `completed`, the `videoUrl` from the job document is set in state and rendered in an inline `<video>` element with `controls`, `autoPlay`, and `loop`.
6. When status becomes `failed`, `job.errorMessage` is displayed directly (the actual error, not a generic string).
7. A download button creates an `<a>` element with the data URL `href` and triggers a click to save `ai-video-{timestamp}.mp4`.

### Image Gallery

- `Gallery.jsx` calls `getHistory()` → `GET /api/images` on mount via `useEffect`.
- Returns all documents from the `images` collection sorted newest-first.
- Each image is rendered in `ImageCard.jsx` with the prompt, localeDateString formatted date, and a download button.

### Video Gallery

- `VideoGallery.jsx` calls `getVideos()` → `GET /api/videos` on mount.
- Returns only documents with `status: 'completed'`, sorted newest-first.
- Each card shows an inline `<video>` element (no autoplay in gallery), the prompt, `toLocaleString` formatted date, a Download button, and a Delete button.
- Delete calls `DELETE /api/videos/{id}` and filters the video out of the local state array optimistically.

---

## API Endpoints

### Chat & Image

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/chat` | Send a message or image. Body: `{ prompt, image?, mimeType? }` |
| POST | `/api/generate-image` | Generate an image. Body: `{ prompt }`. Returns `{ _id, prompt, createdAt, imageUrl }` |
| GET | `/api/images` | Returns all images sorted newest-first |
| GET | `/api/health` | Returns `{ openrouter: bool, gemini: bool\|'quota_exceeded', nvidia: bool }` |

### Video

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/generate-video` | Start video generation. Body: `{ prompt }`. Returns `{ jobId, status: 'processing' }` immediately (HTTP 202) |
| GET | `/api/video-job/:id` | Poll job status. Returns the full Video document |
| GET | `/api/videos` | Returns all completed videos sorted newest-first |
| DELETE | `/api/videos/:id` | Delete a video by MongoDB `_id` |

---

## Database Collections

### `images`

| Field | Type | Notes |
|---|---|---|
| `prompt` | String | Required. Original user prompt |
| `imageUrl` | String | Required. `data:image/jpeg;base64,...` |
| `createdAt` | Date | Default `Date.now` |

### `videos`

| Field | Type | Notes |
|---|---|---|
| `prompt` | String | Required. Original user prompt |
| `videoUrl` | String | `data:video/mp4;base64,...` — set on completion |
| `status` | String | `pending` / `processing` / `completed` / `failed` |
| `provider` | String | `multi-scene` on success (reflects merged output) |
| `errorMessage` | String | Set on failure |
| `duration` | Number | Optional |
| `resolution` | String | Optional |
| `createdAt` | Date | Default `Date.now` |

---

## Environment Variables

Create `backend/.env` with the following:

```env
# Server
PORT=5001

# Database
MONGODB_URI=your_mongodb_atlas_connection_string

# AI — Chat & Image
GEMINI_API_KEY=your_gemini_api_key
OPENROUTER_API_KEY=your_openrouter_api_key
NVIDIA_API_KEY=your_nvidia_api_key

# AI — Video Generation (8-provider failover chain, tried in order)
POLLINATIONS_API_KEY=your_pollinations_api_key
FAL_API_KEY=your_fal_api_key
RUNWARE_API_KEY=your_runware_api_key
JSON2VIDEO_API_KEY=your_json2video_api_key
FLATKEY_API_KEY=your_flatkey_api_key
HIGGSFIELD_API_KEY=your_higgsfield_api_key
COMETAPI_API_KEY=your_cometapi_api_key
SILICONFLOW_API_KEY=your_siliconflow_api_key
```

Where to get each key:

- `MONGODB_URI` — [MongoDB Atlas](https://cloud.mongodb.com/)
- `GEMINI_API_KEY` — [Google AI Studio](https://aistudio.google.com/)
- `OPENROUTER_API_KEY` — [OpenRouter](https://openrouter.ai/keys)
- `NVIDIA_API_KEY` — [NVIDIA NGC](https://org.ngc.nvidia.com/setup/api-key)
- `POLLINATIONS_API_KEY` — [Pollinations](https://pollinations.ai/) (used for scene background images only — no video API)
- `FAL_API_KEY` — [Fal Dashboard](https://fal.ai/dashboard) (requires paid balance for video)
- `RUNWARE_API_KEY` — [Runware](https://my.runware.ai/wallet) (requires paid invoice for video)
- `JSON2VIDEO_API_KEY` — [JSON2Video Dashboard](https://json2video.com/dashboard) (primary working video provider)
- `FLATKEY_API_KEY` — [Flatkey / SiliconFlow](https://siliconflow.cn/)
- `HIGGSFIELD_API_KEY` — [Higgsfield AI](https://higgsfield.ai/)
- `COMETAPI_API_KEY` — [CometAPI](https://cometapi.com/)
- `SILICONFLOW_API_KEY` — [SiliconFlow](https://siliconflow.cn/) (uses `Wan-AI/Wan2.1-T2V-14B`)

---

## Video Provider Details

### Failover chain order

```
1. Pollinations  →  skips immediately (image API only, no video endpoint)
2. Fal           →  queue.fal.run, fal-ai/minimax-video, polls every 4s
3. Runware       →  api.runware.ai/v1, videoInference task, synchronous response
4. JSON2Video    →  api.json2video.com/v2/movies, AI image background + Ken Burns zoom
5. Flatkey       →  api.siliconflow.cn, wan-i2v-480p, polls every 5s
6. Higgsfield    →  api.higgsfield.ai/v1/generation, animate_diff, polls every 5s
7. CometAPI      →  api.cometapi.com/v1/videos, cogvideox-5b, polls every 5s
8. SiliconFlow   →  api.siliconflow.cn, Wan-AI/Wan2.1-T2V-14B, polls every 5s
```

### Failover triggers

Any of the following in the error message causes the current provider to be skipped and the next to be tried immediately for the same scene:

- Rate limit / Too many requests / 429
- Quota exceeded / Credit exhausted / Insufficient balance
- Server error / 500 / 502 / 503 / 504
- Timeout / Timed out / Aborted
- Network error / ECONNRESET / ENOTFOUND / ECONNREFUSED
- Unavailable / Overloaded / Capacity

### How JSON2Video produces visual video

JSON2Video renders an `image` element (not a `text` element) with a Pollinations-generated AI image as the source. The Pollinations FLUX model generates a 1280×720 image from each scene's prompt. JSON2Video then renders it as a video clip with a Ken Burns `zoom: 'in'` effect, producing a real visual video. This is why JSON2Video functions as a visual provider despite not being a generative AI video model.

### Scene recovery

If scene 4 fails on provider A and succeeds on provider B, scenes 1–3 (already saved to temp files) are not re-generated. The loop resumes from scene 4 with the next provider. Only after all scenes are individually saved does FFmpeg merging begin.

### FFmpeg merging

All scene clips are saved to the OS temp directory. A concat list file is written with forward-slash paths (required by FFmpeg's concat demuxer even on Windows). FFmpeg is invoked with `-f concat -safe 0 -c copy` — stream copy mode preserves the original codec, resolution, frame rate, and quality without transcoding. The merged file is read into memory, base64-encoded, and returned. All temp files (individual clips, concat list, merged file) are deleted after the base64 string is extracted.

---

## Setup Instructions

### 1. Backend Setup

```bash
cd backend
npm install
```

Configure `backend/.env` as shown above, then start:

```bash
npm run dev      # development with nodemon
npm start        # production
```

Server runs on `http://localhost:5001`.

### 2. Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

Frontend runs on `http://localhost:5173`.

---

## Deployment

### Backend (Render / Railway)

1. Push code to GitHub.
2. Create a new Web Service.
3. Set Root Directory to `backend`.
4. Set Build Command: `npm install`
5. Set Start Command: `node server.js`
6. Add all environment variables from `backend/.env`.

### Frontend (Vercel / Netlify)

1. Create a new project and connect the repository.
2. Set Root Directory to `frontend`.
3. Set Build Command: `npm run build`
4. Set Output Directory: `dist`
5. Deploy.

> **Note:** After deploying the backend, update `baseURL` in `frontend/src/services/api.js` and `frontend/src/services/videoApi.js` from `http://localhost:5001/api` to your deployed backend URL.

---

## Video Provider Configuration

Provider order and model settings are controlled in `backend/config/videoConfig.js`.

```js
const PROVIDER_CHAIN = [
    'pollinations',
    'fal',
    'runware',
    'json2video',
    'flatkey',
    'higgsfield',
    'cometapi',
    'siliconflow',
];
```

- To disable a provider: remove its name from `PROVIDER_CHAIN`.
- To change a model: edit the `model` value under `VIDEO_PROVIDERS[name]`.
- To change the number of scenes: pass a different `sceneCount` when calling `generateVideo(prompt, sceneCount)` in `videoController.js`.
- To change scene duration for JSON2Video: edit `sceneDuration` under `VIDEO_PROVIDERS.json2video` (default: 6 seconds per scene).
- To adjust polling timeouts: edit `timeoutMs` per provider.

---

## Known Provider Status

| Provider | Status | Reason |
|---|---|---|
| Pollinations | Skipped (by design) | No video API — used only for scene background images |
| Fal | Failover | Requires paid balance |
| Runware | Failover | Requires paid invoice for video inference |
| JSON2Video | **Primary working provider** | Renders AI image backgrounds as visual video |
| Flatkey | Failover | Activates when balance is topped up |
| Higgsfield | Failover | Activates when service is online |
| CometAPI | Failover | Activates when API key is valid |
| SiliconFlow | Failover | Activates when API key is valid |
