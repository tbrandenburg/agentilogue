# agentilogue

Agentilogue is a Next.js chat app built with [assistant-ui](https://github.com/assistant-ui/assistant-ui) and the Vercel AI SDK. Its chat interface streams responses from OpenAI's `gpt-6-luna` model. The chat route also forwards frontend tools supplied by the assistant-ui client.

## Run locally

Requirements: [Bun](https://bun.sh/) and an OpenAI API key.

1. Create a `.env.local` file in the project root with your API key:

   ```env
   OPENAI_API_KEY=your-api-key
   ```

2. Install dependencies and start the development server:

   ```bash
   bun install
   bun run dev
   ```

3. Open [http://localhost:3000](http://localhost:3000).

The chat UI is in `components/assistant-ui/elements/thread.aui.tsx`, the runtime is configured in `app/assistant.tsx`, and requests are handled by `app/api/chat/route.ts`.
