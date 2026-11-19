import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
    build: {
      chunkSizeWarningLimit: 800,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules')) {
              return 'vendor';
            }
            if (id.includes('/src/annotations_drawing.js')) {
              return 'drawing-engine';
            }
            if (id.includes('/src/reader.js') || id.includes('/src/selection.js') || id.includes('/src/page_tools.js')) {
              return 'reader-core';
            }
            if (id.includes('/src/ai/study_core.js') || id.includes('/src/ai/topic_chat.js')) {
              return 'ai-study';
            }
            if (id.includes('/src/ai/dictionary.js')) {
              return 'ai-dictionary';
            }
            if (id.includes('/src/ai/quiz_flashcards_translate.js')) {
              return 'ai-quiz-flashcards';
            }
            if (id.includes('/src/ai/tts_read_aloud.js') || id.includes('/src/mind_audio.js')) {
              return 'ai-tts-audio';
            }
            if (
              id.includes('/src/paper_core.js') ||
              id.includes('/src/paper_engine.js') ||
              id.includes('/src/paper_print.js') ||
              id.includes('/src/paper_ui.js') ||
              id.includes('/src/teacher')
            ) {
              return 'exam-tutor';
            }
            if (id.includes('/src/views_dashboard.js') || id.includes('/src/views_other.js') || id.includes('/src/study_plan.js')) {
              return 'views-ui';
            }
          },
        },
      },
    },
  };
});

