# Use a lightweight official Node.js image for the frontend build/runtime.
FROM node:22-alpine

# Accept the public API base URL at build time for Next.js.
ARG NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
# Run the app in production mode.
ENV NODE_ENV=production
# Expose the build arg as an environment variable during the Next.js build.
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL

# Set the working directory inside the container.
WORKDIR /app

# Copy dependency manifests first to maximize Docker layer caching.
COPY package.json package-lock.json ./
# Install exactly the versions pinned in package-lock.json.
RUN npm ci

# Copy the rest of the frontend source code.
COPY . .

# Build the production Next.js application.
RUN npm run build

# Document that the app serves traffic on port 3000.
EXPOSE 3000

# Start the Next.js production server and bind it to all interfaces.
CMD ["npm", "start", "--", "--hostname", "0.0.0.0", "--port", "3000"]
