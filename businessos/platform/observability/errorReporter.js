/**
 * BusinessOS Platform - Lightweight Error Reporter (Stage 4 observability).
 *
 * The audit found many `catch (e) { console.warn(...) }` blocks in the write
 * path that swallow failures with no telemetry, so a production incident looks
 * like a silent no-op. This module centralizes "report a non-fatal error" so
 * those blocks can call one function instead of just logging.
 *
 * Design constraints (must stay NON-BREAKING):
 *  - Zero new npm dependency. We use a Sentry global if the host page has one
 *    (loaded via a plain <script> or CDN on the deploy target) and do nothing
 *    otherwise, so behavior in dev / tests is unchanged.
 *  - Never throws. Reporting must not turn a swallowed error into a crash.
 *  - Only active when a DSN / Sentry is actually configured, so no data leaves
 *    the device unless the operator opted in at deploy time.
 */

function _hasSentry() {
  return typeof window !== 'undefined' && window.Sentry &&
    (typeof window.Sentry.captureException === 'function' || typeof window.Sentry.captureMessage === 'function');
}

/**
 * Report a caught-but-non-fatal error to the configured observability backend.
 * @param {Error|string} error
 * @param {Object} [context] structured key/value context (tags/extra).
 * @param {string} [context.fingerprint] groups related events.
 */
export function reportNonFatal(error, context = {}) {
  try {
    const err = (error instanceof Error) ? error : new Error(String(error && error.message ? error.message : error));
    if (_hasSentry()) {
      if (typeof window.Sentry.setExtras === 'function') {
        try { window.Sentry.setExtras(context || {}); } catch (_) {}
      }
      if (context && context.fingerprint && typeof window.Sentry.configureScope === 'function') {
        try {
          window.Sentry.configureScope((scope) => {
            if (typeof scope.setFingerprint === 'function') {
              scope.setFingerprint([context.fingerprint]);
            }
          });
        } catch (_) {}
      }
      if (typeof window.Sentry.captureException === 'function') {
        window.Sentry.captureException(err);
      } else if (typeof window.Sentry.captureMessage === 'function') {
        window.Sentry.captureMessage(err.message);
      }
    }
    // Always keep the local console trail too (dev + tests).
    console.warn('[reportNonFatal]', err.message, context && context.scope ? `scope=${context.scope}` : '');
  } catch (_) {
    // Reporting must never throw.
  }
}

/**
 * Convenience breadcrumb helper (no-op without Sentry).
 * @param {string} message
 * @param {Object} [data]
 */
export function addBreadcrumb(message, data = {}) {
  try {
    if (_hasSentry() && typeof window.Sentry.addBreadcrumb === 'function') {
      window.Sentry.addBreadcrumb({ message: String(message), data });
    }
  } catch (_) {}
}

export default reportNonFatal;
