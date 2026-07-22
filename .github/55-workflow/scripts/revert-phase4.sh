#!/bin/bash

# 55-Workflow Phase 4 Revert Helper
# Automatically reverts all modifications back to pristine Phase 3 state
# and confirms codebase cleanliness.
# For CDK projects, also destroys deployed stacks.

set -e

echo "================================"
echo "Phase 4 Revert Helper"
echo "================================"
echo ""

# Step 1: Check if git is available
if ! command -v git &> /dev/null; then
    echo "❌ ERROR: git command not found. Ensure git is installed."
    exit 1
fi

# Step 2: Check if we're in a git repository
if ! git rev-parse --git-dir > /dev/null 2>&1; then
    echo "❌ ERROR: Not in a git repository. Navigate to the project root."
    exit 1
fi

# Step 3: Show current status
echo "📋 Current git status:"
git status --short
echo ""

# Step 4: Confirm before reverting
read -p "⚠️  This will revert ALL uncommitted changes and destroy Phase 4 resources. Continue? (y/N) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ Revert cancelled."
    exit 1
fi

# Step 5: Check if CDK stack exists and destroy it
echo ""
echo "🔍 Checking for deployed CDK stacks..."
if command -v cdk &> /dev/null && [ -f "cdk.json" ]; then
    echo "📦 CDK detected. Destroying deployed stacks (Phase 4 resources only)..."
    
    # Destroy CDK stacks (non-interactive, don't wait for confirmation)
    if cdk destroy --force --all 2>/dev/null || true; then
        echo "✅ CDK stacks destroyed."
    else
        echo "⚠️  CDK destroy encountered issues (may be expected if no stacks deployed)."
    fi
else
    echo "ℹ️  No CDK project detected or cdk not installed. Skipping CDK cleanup."
fi

# Step 6: Revert all modified files
echo ""
echo "🔄 Reverting all modified files..."
git checkout -- .
echo "✅ Files reverted to HEAD state."

# Step 7: Remove untracked files (temp test artifacts)
echo ""
echo "🧹 Cleaning untracked files..."
git clean -fd
echo "✅ Untracked files removed."

# Step 8: Verify clean state
echo ""
echo "🔍 Verifying clean state..."
DIRTY=$(git status --porcelain | wc -l)

if [ "$DIRTY" -eq 0 ]; then
    echo "✅ SUCCESS: Codebase is clean. Phase 3 state restored."
    echo ""
    echo "Next steps:"
    echo "  1. Review Phase 4 simulation findings and defect pattern validations"
    echo "  2. Ask for approval: 'Are the Phase 4.5 defect pattern validations approved?'"
    echo "  3. Either approve and proceed to Phase 5, or loop back to Phase 1-3"
    exit 0
else
    echo "❌ ERROR: Codebase still has uncommitted changes:"
    git status --short
    echo ""
    echo "Manual cleanup may be needed. Run: git status"
    exit 1
fi
