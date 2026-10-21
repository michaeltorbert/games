// Learning-report service origin for this game host (#200). Empty means reporting is
// disabled: no enrollment, no sync storage read, no timer and no request of any kind.
// Set it to the deployed learning-reporting Worker origin (https, no path) only after the
// setup checklist in services/learning-reporting/README.md is complete and verified.
globalThis.LEARNING_REPORTING_CONFIG = Object.freeze({ serviceUrl: '' });
