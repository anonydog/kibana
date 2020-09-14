#!/bin/bash

set -euo pipefail

source "$(dirname "${0}")/../util.sh"

export JOB=kibana-oss-accessibility
export KIBANA_INSTALL_DIR="$KIBANA_DIR/build/kibana-build-oss"

checks-reporter-with-killswitch "Kibana accessibility tests" \
  node scripts/functional_tests \
    --debug --bail \
    --kibana-install-dir "$KIBANA_INSTALL_DIR" \
    --config test/accessibility/config.ts
