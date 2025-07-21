# pylint: skip-file
# flake8: noqa

import os
import sys
from .devtools import DevTools
from .splatdle import SplatdleExt
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))