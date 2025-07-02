

#!/bin/bash

# Docker build and push script for sneakyofficial.com
# Usage: ./docker.sh [OPTIONS]
# Options:
#   --api-url URL    Set the API URL (default: https://www.sneakyofficial.com)
#   --tag TAG        Set the Docker tag (default: latest)
#   --registry REG   Set the Docker registry (default: sneakynarnar)
#   --no-push        Build only, don't push to registry
#   --help           Show this help message

set -e

# Default values
API_URL="https://www.sneakyofficial.com"
TAG="latest"
REGISTRY="sneakynarnar"
IMAGE_NAME="sneakyofficial.com"
PUSH=true
DOCKERFILE="Dockerfile"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to display help
show_help() {
    echo "Docker build and push script for sneakyofficial.com"
    echo ""
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  --api-url URL    Set the API URL for the frontend (default: https://www.sneakyofficial.com)"
    echo "  --tag TAG        Set the Docker tag (default: latest)"
    echo "  --registry REG   Set the Docker registry (default: sneakynarnar)"
    echo "  --no-push        Build only, don't push to registry"
    echo "  --help           Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0                                    # Build and push with defaults"
    echo "  $0 --api-url https://api.example.com # Build with custom API URL"
    echo "  $0 --tag v1.0.0 --no-push           # Build with custom tag, no push"
    echo "  $0 --registry myregistry/myrepo      # Build with custom registry"
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --api-url)
            API_URL="$2"
            shift 2
            ;;
        --tag)
            TAG="$2"
            shift 2
            ;;
        --registry)
            REGISTRY="$2"
            shift 2
            ;;
        --no-push)
            PUSH=false
            shift
            ;;
        --help)
            show_help
            exit 0
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            show_help
            exit 1
            ;;
    esac
done

# Construct full image name
FULL_IMAGE_NAME="${REGISTRY}/${IMAGE_NAME}:${TAG}"

# Display build configuration
echo -e "${BLUE}=== Docker Build Configuration ===${NC}"
echo -e "API URL: ${YELLOW}${API_URL}${NC}"
echo -e "Image: ${YELLOW}${FULL_IMAGE_NAME}${NC}"
echo -e "Push to registry: ${YELLOW}${PUSH}${NC}"
echo ""

# Check if Dockerfile exists
if [[ ! -f "$DOCKERFILE" ]]; then
    echo -e "${RED}Error: $DOCKERFILE not found!${NC}"
    exit 1
fi

# Build the Docker image
echo -e "${BLUE}=== Building Docker Image ===${NC}"
echo -e "Building: ${YELLOW}${FULL_IMAGE_NAME}${NC}"

docker build \
    --build-arg VITE_API_URL="${API_URL}" \
    -t "${FULL_IMAGE_NAME}" \
    -f "${DOCKERFILE}" \
    .

if [[ $? -eq 0 ]]; then
    echo -e "${GREEN}✓ Build completed successfully!${NC}"
else
    echo -e "${RED}✗ Build failed!${NC}"
    exit 1
fi

# Push to registry if requested
if [[ "$PUSH" == true ]]; then
    echo ""
    echo -e "${BLUE}=== Pushing to Registry ===${NC}"
    echo -e "Pushing: ${YELLOW}${FULL_IMAGE_NAME}${NC}"
    
    docker push "${FULL_IMAGE_NAME}"
    
    if [[ $? -eq 0 ]]; then
        echo -e "${GREEN}✓ Push completed successfully!${NC}"
    else
        echo -e "${RED}✗ Push failed!${NC}"
        exit 1
    fi
fi

# Display final information
echo ""
echo -e "${GREEN}=== Build Summary ===${NC}"
echo -e "Image: ${YELLOW}${FULL_IMAGE_NAME}${NC}"
echo -e "API URL: ${YELLOW}${API_URL}${NC}"
if [[ "$PUSH" == true ]]; then
    echo -e "Status: ${GREEN}Built and pushed successfully${NC}"
    echo ""
    echo -e "${BLUE}To run the container:${NC}"
    echo -e "${YELLOW}docker run -p 8080:8080 --env-file .env ${FULL_IMAGE_NAME}${NC}"
else
    echo -e "Status: ${GREEN}Built successfully (not pushed)${NC}"
    echo ""
    echo -e "${BLUE}To run the container:${NC}"
    echo -e "${YELLOW}docker run -p 8080:8080 --env-file .env ${FULL_IMAGE_NAME}${NC}"
fi

echo ""
echo -e "${GREEN}Done!${NC}"