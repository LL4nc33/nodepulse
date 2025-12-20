/* nodepulse - i18n Manager
   ES5 compatible for Chrome 50+, Fire HD 10 2017
*/

var I18n = {
  currentLang: 'de',
  STORAGE_KEY: 'nodepulse-language',

  /**
   * Initialize i18n with saved language preference
   */
  init: function() {
    try {
      var saved = localStorage.getItem(this.STORAGE_KEY);
      if (saved && Translations && Translations[saved]) {
        this.currentLang = saved;
      }
    } catch(e) {
      // localStorage may not be available
    }
    this.applyTranslations();
  },

  /**
   * Set the current language
   * @param {string} lang - Language code ('de' or 'en')
   */
  setLanguage: function(lang) {
    if (Translations && Translations[lang]) {
      this.currentLang = lang;
      try {
        localStorage.setItem(this.STORAGE_KEY, lang);
      } catch(e) {
        // localStorage may not be available
      }
      this.applyTranslations();
    }
  },

  /**
   * Get translation for a key
   * @param {string} key - Dot-notation key (e.g., 'sections.hardwareDetails')
   * @returns {string} Translated string or key if not found
   */
  t: function(key) {
    if (!Translations || !Translations[this.currentLang]) {
      return key;
    }
    var keys = key.split('.');
    var value = Translations[this.currentLang];
    for (var i = 0; i < keys.length; i++) {
      value = value[keys[i]];
      if (!value) return key;
    }
    return value;
  },

  /**
   * Apply translations to all elements with data-i18n attribute
   */
  applyTranslations: function() {
    var elements = document.querySelectorAll('[data-i18n]');
    for (var i = 0; i < elements.length; i++) {
      var el = elements[i];
      var key = el.getAttribute('data-i18n');
      if (key) {
        el.textContent = this.t(key);
      }
    }
    // Update language indicator
    var indicator = document.getElementById('langIndicator');
    if (indicator) {
      indicator.textContent = this.currentLang.toUpperCase();
    }
  },

  /**
   * Toggle between German and English
   */
  toggle: function() {
    this.setLanguage(this.currentLang === 'de' ? 'en' : 'de');
  },

  /**
   * Get current language code
   * @returns {string} Current language code
   */
  getLang: function() {
    return this.currentLang;
  }
};

// Initialize i18n on DOMContentLoaded
document.addEventListener('DOMContentLoaded', function() {
  I18n.init();
});
