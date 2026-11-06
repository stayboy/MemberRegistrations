# syntax=docker/dockerfile:1

FROM node:24.22.2-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# The root is an npm workspace containing ui; npm ci needs the workspace
# manifest to resolve the hoisted UI dependencies into node_modules.
COPY ui/package.json ./ui/package.json
RUN npm ci

FROM deps AS build
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

FROM deps AS prod-deps
RUN npm prune --omit=dev

FROM node:24.22.2-alpine AS api
# Local-only image. The default is production so a bare `docker run` of this
# image fails closed (env validation + Resend mailer); compose sets
# NODE_ENV=development explicitly for the local stack.
ENV NODE_ENV=production
WORKDIR /app
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
EXPOSE 3000
USER node
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=6 \
  CMD node -e "fetch('http://127.0.0.1:3000/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["node", "dist/index.js"]

FROM deps AS ui-build
ARG VITE_GATEWAY_URL=http://localhost:3000
ENV VITE_GATEWAY_URL=$VITE_GATEWAY_URL
COPY ui ./ui
WORKDIR /app/ui
# Local builds use base `/`; vite.config.ts only switches to
# `/MemberRegistrations/` for the production GitHub Pages build.
RUN npx vite build --mode development

FROM nginx:1.31.2-alpine AS ui
COPY --from=ui-build /app/ui/dist /usr/share/nginx/html
