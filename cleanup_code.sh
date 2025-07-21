#!/bin/bash

# Claude generated bash cleanup script

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_header() {
    echo -e "${BLUE}=== $1 ===${NC}"
}

# Get the directory to clean (default to current directory)
TARGET_DIR="${1:-.}"

if [[ ! -d "$TARGET_DIR" ]]; then
    print_error "Directory '$TARGET_DIR' does not exist!"
    exit 1
fi

print_header "Starting Python Code Cleanup for: $TARGET_DIR"

# Count Python files (excluding node_modules and other common exclusions)
PYTHON_FILES=$(find "$TARGET_DIR" -name "*.py" \
    -not -path "*/node_modules/*" \
    -not -path "*/venv/*" \
    -not -path "*/env/*" \
    -not -path "*/.venv/*" \
    -not -path "*/__pycache__/*" \
    -not -path "*/.git/*" | wc -l)

print_status "Found $PYTHON_FILES Python files to process"

if [[ $PYTHON_FILES -eq 0 ]]; then
    print_warning "No Python files found in $TARGET_DIR"
    exit 0
fi

# Step 1: Remove whitespace from blank lines
print_header "Step 1: Cleaning blank lines"
find "$TARGET_DIR" -name "*.py" \
    -not -path "*/node_modules/*" \
    -not -path "*/venv/*" \
    -not -path "*/env/*" \
    -not -path "*/.venv/*" \
    -not -path "*/__pycache__/*" \
    -not -path "*/.git/*" \
    -exec sed -i 's/^[ \t]*$//' {} \;

print_status "Removed whitespace from blank lines"

# Step 2: Remove trailing whitespace
print_header "Step 2: Removing trailing whitespace"
find "$TARGET_DIR" -name "*.py" \
    -not -path "*/node_modules/*" \
    -not -path "*/venv/*" \
    -not -path "*/env/*" \
    -not -path "*/.venv/*" \
    -not -path "*/__pycache__/*" \
    -not -path "*/.git/*" \
    -exec sed -i 's/[[:space:]]*$//' {} \;

print_status "Removed trailing whitespace"

# Step 3: Verify cleanup
print_header "Step 3: Verifying cleanup"
REMAINING_WHITESPACE=$(find "$TARGET_DIR" -name "*.py" \
    -not -path "*/node_modules/*" \
    -not -path "*/venv/*" \
    -not -path "*/env/*" \
    -not -path "*/.venv/*" \
    -not -path "*/__pycache__/*" \
    -not -path "*/.git/*" \
    -exec egrep -l '[[:space:]]+$' {} \; 2>/dev/null | wc -l)

if [[ $REMAINING_WHITESPACE -eq 0 ]]; then
    print_status "✅ All trailing whitespace successfully removed!"
else
    print_warning "⚠️ $REMAINING_WHITESPACE files still have trailing whitespace"
fi

# Step 4: Show summary
print_header "Cleanup Summary"
print_status "Processed: $PYTHON_FILES Python files"
print_status "✅ Cleaned blank lines (removed spaces/tabs)"
print_status "✅ Removed trailing whitespace"

# Optional: Check for common issues
print_header "Code Quality Check"

# Check for files with mixed indentation
MIXED_INDENT=$(find "$TARGET_DIR" -name "*.py" \
    -not -path "*/node_modules/*" \
    -not -path "*/venv/*" \
    -not -path "*/env/*" \
    -not -path "*/.venv/*" \
    -not -path "*/__pycache__/*" \
    -not -path "*/.git/*" \
    -exec grep -l $'^\t.* ' {} \; 2>/dev/null | wc -l)

if [[ $MIXED_INDENT -gt 0 ]]; then
    print_warning "⚠️ Found $MIXED_INDENT files with mixed tab/space indentation"
else
    print_status "✅ No mixed indentation detected"
fi

# Check for files with very long lines (excluding ASCII art banners)
LONG_LINES=0
for file in $(find "$TARGET_DIR" -name "*.py" \
    -not -path "*/node_modules/*" \
    -not -path "*/venv/*" \
    -not -path "*/env/*" \
    -not -path "*/.venv/*" \
    -not -path "*/__pycache__/*" \
    -not -path "*/.git/*"); do
    
    # Check for long lines but exclude ASCII banner sections and common long-line patterns
    LONG_LINE_COUNT=$(grep '.\{121,\}' "$file" 2>/dev/null | \
        grep -v "ASCII_BANNER\|==\+\|fr\"\"\"\|#.*=\+\|\"\"\".*=\+\|\\$\\$\|//\|\\\\\\|\|\\$" | \
        wc -l)
    
    if [[ $LONG_LINE_COUNT -gt 0 ]]; then
        ((LONG_LINES++))
    fi
done

if [[ $LONG_LINES -gt 0 ]]; then
    print_warning "⚠️ Found $LONG_LINES files with lines longer than 120 characters"
else
    print_status "✅ All lines are within reasonable length"
fi

print_header "Cleanup Complete!"
print_status "Your Python codebase has been cleaned up successfully! 🎉"
print_status "Run 'flake8' or 'pylint' for additional code quality checks."

echo
print_status "Usage: $0 [directory]"
print_status "Example: $0 /path/to/your/project"
print_status "Default: Current directory"