/**
 * nodepulse Toast Notifications (ES5)
 * Non-blocking notification system for alerts and feedback
 * Compatible with Chrome 50+ (Raspberry Pi, Fire HD 10)
 */

(function(window) {
  'use strict';

  // Default options
  var defaultOptions = {
    position: 'top-right',      // top-right, top-left, bottom-right, bottom-left
    duration: 5000,             // auto-dismiss after 5 seconds
    maxToasts: 5,               // max visible toasts
    animationDuration: 300,     // slide animation duration
    pauseOnHover: true,         // pause auto-dismiss on hover
    showProgress: true,         // show countdown progress bar
    closeButton: true           // show close button
  };

  var toastContainer = null;
  var toasts = [];
  var toastId = 0;
  var options = {};

  /**
   * Initialize the notification system
   * @param {Object} customOptions - Custom options
   */
  function init(customOptions) {
    options = mergeOptions(defaultOptions, customOptions || {});
    createContainer();
  }

  /**
   * Merge options with defaults
   */
  function mergeOptions(defaults, custom) {
    var result = {};
    var key;
    for (key in defaults) {
      if (defaults.hasOwnProperty(key)) {
        result[key] = defaults[key];
      }
    }
    for (key in custom) {
      if (custom.hasOwnProperty(key)) {
        result[key] = custom[key];
      }
    }
    return result;
  }

  /**
   * Create the toast container
   */
  function createContainer() {
    if (toastContainer) return;

    toastContainer = document.createElement('div');
    toastContainer.id = 'toast-container';
    toastContainer.className = 'toast-container toast-' + options.position;
    document.body.appendChild(toastContainer);
  }

  /**
   * Show a toast notification
   * @param {string} message - Toast message
   * @param {string} type - Toast type (success, error, warning, info)
   * @param {Object} toastOptions - Override default options
   * @returns {number} Toast ID for manual dismissal
   */
  function show(message, type, toastOptions) {
    if (!toastContainer) {
      init();
    }

    var opts = mergeOptions(options, toastOptions || {});
    var id = ++toastId;

    // Limit visible toasts
    while (toasts.length >= opts.maxToasts) {
      dismiss(toasts[0].id);
    }

    // Create toast element
    var toast = document.createElement('div');
    toast.id = 'toast-' + id;
    toast.className = 'toast toast-' + (type || 'info');
    toast.setAttribute('role', 'alert');
    toast.setAttribute('aria-live', 'assertive');

    // Build toast content
    var content = '<div class="toast-content">';
    content += '<span class="toast-icon">' + getIcon(type) + '</span>';
    content += '<span class="toast-message">' + escapeHtml(message) + '</span>';
    if (opts.closeButton) {
      content += '<button type="button" class="toast-close" aria-label="Schliessen">&times;</button>';
    }
    content += '</div>';

    if (opts.showProgress && opts.duration > 0) {
      content += '<div class="toast-progress"><div class="toast-progress-bar"></div></div>';
    }

    toast.innerHTML = content;

    // Add to container
    if (options.position.indexOf('bottom') === 0) {
      toastContainer.appendChild(toast);
    } else {
      toastContainer.insertBefore(toast, toastContainer.firstChild);
    }

    // Store toast info
    var toastInfo = {
      id: id,
      element: toast,
      timeout: null,
      startTime: Date.now(),
      duration: opts.duration,
      remainingTime: opts.duration,
      paused: false
    };
    toasts.push(toastInfo);

    // Setup close button
    if (opts.closeButton) {
      var closeBtn = toast.querySelector('.toast-close');
      closeBtn.onclick = function() {
        dismiss(id);
      };
    }

    // Setup hover pause
    if (opts.pauseOnHover && opts.duration > 0) {
      toast.onmouseenter = function() {
        pauseToast(toastInfo);
      };
      toast.onmouseleave = function() {
        resumeToast(toastInfo, opts);
      };
    }

    // Trigger entrance animation
    setTimeout(function() {
      toast.classList.add('toast-visible');
    }, 10);

    // Start progress animation
    if (opts.showProgress && opts.duration > 0) {
      var progressBar = toast.querySelector('.toast-progress-bar');
      if (progressBar) {
        progressBar.style.transition = 'width ' + opts.duration + 'ms linear';
        setTimeout(function() {
          progressBar.style.width = '0%';
        }, 10);
      }
    }

    // Auto dismiss
    if (opts.duration > 0) {
      toastInfo.timeout = setTimeout(function() {
        dismiss(id);
      }, opts.duration);
    }

    return id;
  }

  /**
   * Get icon for toast type
   */
  function getIcon(type) {
    switch (type) {
      case 'success':
        return '<svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>';
      case 'error':
        return '<svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>';
      case 'warning':
        return '<svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/></svg>';
      case 'info':
      default:
        return '<svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg>';
    }
  }

  /**
   * Escape HTML to prevent XSS
   */
  function escapeHtml(text) {
    var div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Pause toast auto-dismiss
   */
  function pauseToast(toastInfo) {
    if (toastInfo.timeout) {
      clearTimeout(toastInfo.timeout);
      toastInfo.timeout = null;
    }
    toastInfo.remainingTime = toastInfo.remainingTime - (Date.now() - toastInfo.startTime);
    toastInfo.paused = true;

    // Pause progress bar
    var progressBar = toastInfo.element.querySelector('.toast-progress-bar');
    if (progressBar) {
      var computedStyle = window.getComputedStyle(progressBar);
      var currentWidth = computedStyle.width;
      progressBar.style.transition = 'none';
      progressBar.style.width = currentWidth;
    }
  }

  /**
   * Resume toast auto-dismiss
   */
  function resumeToast(toastInfo, opts) {
    if (!toastInfo.paused || toastInfo.remainingTime <= 0) return;

    toastInfo.startTime = Date.now();
    toastInfo.paused = false;

    // Resume progress bar
    var progressBar = toastInfo.element.querySelector('.toast-progress-bar');
    if (progressBar) {
      progressBar.style.transition = 'width ' + toastInfo.remainingTime + 'ms linear';
      setTimeout(function() {
        progressBar.style.width = '0%';
      }, 10);
    }

    toastInfo.timeout = setTimeout(function() {
      dismiss(toastInfo.id);
    }, toastInfo.remainingTime);
  }

  /**
   * Dismiss a toast
   * @param {number} id - Toast ID to dismiss
   */
  function dismiss(id) {
    var toastInfo = null;
    var index = -1;

    for (var i = 0; i < toasts.length; i++) {
      if (toasts[i].id === id) {
        toastInfo = toasts[i];
        index = i;
        break;
      }
    }

    if (!toastInfo) return;

    // Clear timeout
    if (toastInfo.timeout) {
      clearTimeout(toastInfo.timeout);
    }

    // Animate out
    toastInfo.element.classList.remove('toast-visible');
    toastInfo.element.classList.add('toast-hiding');

    // Remove after animation
    setTimeout(function() {
      if (toastInfo.element.parentNode) {
        toastInfo.element.parentNode.removeChild(toastInfo.element);
      }
    }, options.animationDuration);

    // Remove from array
    toasts.splice(index, 1);
  }

  /**
   * Dismiss all toasts
   */
  function dismissAll() {
    var toastsCopy = toasts.slice();
    for (var i = 0; i < toastsCopy.length; i++) {
      dismiss(toastsCopy[i].id);
    }
  }

  /**
   * Convenience methods for different toast types
   */
  function success(message, toastOptions) {
    return show(message, 'success', toastOptions);
  }

  function error(message, toastOptions) {
    return show(message, 'error', toastOptions);
  }

  function warning(message, toastOptions) {
    return show(message, 'warning', toastOptions);
  }

  function info(message, toastOptions) {
    return show(message, 'info', toastOptions);
  }

  /**
   * Show alert notification (for monitoring alerts)
   * @param {Object} alert - Alert object with type, level, nodeName, value
   */
  function showAlert(alert) {
    var type = alert.level === 'critical' ? 'error' : 'warning';
    var message = alert.nodeName + ': ' + alert.type.toUpperCase() + ' ' + alert.value;

    if (alert.threshold) {
      message += ' (Threshold: ' + alert.threshold + ')';
    }

    return show(message, type, {
      duration: alert.level === 'critical' ? 10000 : 7000
    });
  }

  // Export to global scope
  window.Toast = {
    init: init,
    show: show,
    dismiss: dismiss,
    dismissAll: dismissAll,
    success: success,
    error: error,
    warning: warning,
    info: info,
    showAlert: showAlert
  };

})(window);
