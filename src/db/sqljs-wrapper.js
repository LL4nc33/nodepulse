/**
 * sql.js Wrapper - Emuliert better-sqlite3 API
 * Ermöglicht Migration ohne Änderung der 75+ Prepared Statements
 */

const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

class SqlJsWrapper {
  constructor() {
    this.db = null;
    this.dbPath = null;
    this.SQL = null;
    this.isDirty = false;
    this.saveTimer = null;
    this.saveInterval = 60000; // 60 Sekunden
  }

  /**
   * Async Initialisierung
   * @param {string} dbPath - Pfad zur DB-Datei
   * @returns {Promise<SqlJsWrapper>}
   */
  async init(dbPath) {
    this.dbPath = dbPath;

    // sql.js initialisieren (lädt WASM)
    this.SQL = await initSqlJs();

    // Existierende DB laden oder neue erstellen
    if (fs.existsSync(dbPath)) {
      const buffer = fs.readFileSync(dbPath);
      this.db = new this.SQL.Database(buffer);
      console.log('[DB] Loaded existing database');
    } else {
      // Directory erstellen falls nötig
      const dir = path.dirname(dbPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      this.db = new this.SQL.Database();
      console.log('[DB] Created new database');
    }

    // Periodic save starten
    this.startPeriodicSave();

    return this;
  }

  /**
   * better-sqlite3 kompatible pragma() Methode
   * @param {string} statement - PRAGMA statement
   */
  pragma(statement) {
    // WAL mode macht bei sql.js keinen Sinn (in-memory)
    if (statement.toLowerCase().includes('journal_mode')) {
      return; // Ignorieren
    }
    // FK enforcement funktioniert
    if (statement.toLowerCase().includes('foreign_keys')) {
      this.db.run('PRAGMA foreign_keys = ON');
      return;
    }
    // Andere pragmas versuchen
    try {
      const result = this.db.exec('PRAGMA ' + statement);
      if (result.length > 0 && result[0].values.length > 0) {
        return result[0].values[0][0];
      }
    } catch (e) {
      // Ignorieren wenn pragma nicht unterstützt
    }
  }

  /**
   * better-sqlite3 kompatible exec() Methode
   * Führt multi-statement SQL aus
   * @param {string} sql - SQL statements
   */
  exec(sql) {
    this.db.run(sql);
    this.markDirty();
  }

  /**
   * better-sqlite3 kompatible prepare() Methode
   * @param {string} sql - SQL statement
   * @returns {PreparedStatement}
   */
  prepare(sql) {
    return new PreparedStatement(this, sql);
  }

  /**
   * better-sqlite3 kompatible transaction() Methode
   * @param {Function} fn - Funktion die in Transaction ausgeführt wird
   * @returns {Function} - Wrapped function
   */
  transaction(fn) {
    const self = this;
    return function (...args) {
      self.db.run('BEGIN TRANSACTION');
      try {
        const result = fn.apply(this, args);
        self.db.run('COMMIT');
        self.markDirty();
        return result;
      } catch (err) {
        self.db.run('ROLLBACK');
        throw err;
      }
    };
  }

  /**
   * Speichern auf Disk
   */
  save() {
    if (!this.isDirty || !this.db || !this.dbPath) return;

    try {
      const data = this.db.export();
      const buffer = Buffer.from(data);

      // Atomic write: erst temp file, dann rename
      const tempPath = this.dbPath + '.tmp';
      fs.writeFileSync(tempPath, buffer);
      fs.renameSync(tempPath, this.dbPath);

      this.isDirty = false;
      console.log('[DB] Saved to disk');
    } catch (err) {
      console.error('[DB] Save failed:', err.message);
    }
  }

  /**
   * Markiert DB als geändert
   */
  markDirty() {
    this.isDirty = true;
  }

  /**
   * Startet periodisches Speichern
   */
  startPeriodicSave() {
    if (this.saveTimer) return;
    this.saveTimer = setInterval(() => {
      this.save();
    }, this.saveInterval);
    // Unref damit Node.js beenden kann
    if (this.saveTimer.unref) {
      this.saveTimer.unref();
    }
  }

  /**
   * Stoppt periodisches Speichern
   */
  stopPeriodicSave() {
    if (this.saveTimer) {
      clearInterval(this.saveTimer);
      this.saveTimer = null;
    }
  }

  /**
   * Schließt die Datenbank
   */
  close() {
    // Timer stoppen
    this.stopPeriodicSave();

    // Final save
    this.save();

    // DB schließen
    if (this.db) {
      this.db.close();
      this.db = null;
    }

    console.log('[DB] Closed');
  }
}

/**
 * Prepared Statement Wrapper
 * Emuliert better-sqlite3 PreparedStatement API
 */
class PreparedStatement {
  constructor(wrapper, sql) {
    this.wrapper = wrapper;
    this.originalSql = sql;
    this.sql = this.convertNamedParams(sql);
  }

  /**
   * Konvertiert @param zu $param (better-sqlite3 zu sql.js Format)
   * @param {string} sql
   * @returns {string}
   */
  convertNamedParams(sql) {
    return sql.replace(/@(\w+)/g, ':$1');
  }

  /**
   * Konvertiert Parameter-Objekt für sql.js
   * @param {Array|Object} params
   * @returns {Object}
   */
  convertParams(params) {
    if (!params || params.length === 0) return {};

    // Einzelner Parameter (nicht Array, nicht Object mit keys)
    if (typeof params !== 'object') {
      return [params];
    }

    // Array von Parametern - positional binding
    if (Array.isArray(params)) {
      return params;
    }

    // Object: Keys mit : prefixen für sql.js
    const result = {};
    for (const [key, value] of Object.entries(params)) {
      result[':' + key] = value;
    }
    return result;
  }

  /**
   * SELECT multiple rows
   * @param {...any} params
   * @returns {Array<Object>}
   */
  all(...params) {
    let bindParams;
    if (params.length === 1 && params[0] !== null && typeof params[0] === 'object' && !Array.isArray(params[0])) {
      bindParams = this.convertParams(params[0]);
    } else if (params.length > 0) {
      bindParams = params;
    } else {
      bindParams = {};
    }

    let stmt;
    try {
      stmt = this.wrapper.db.prepare(this.sql);
      stmt.bind(bindParams);

      const results = [];
      while (stmt.step()) {
        results.push(stmt.getAsObject());
      }
      return results;
    } finally {
      if (stmt) stmt.free();
    }
  }

  /**
   * SELECT single row
   * @param {...any} params
   * @returns {Object|undefined}
   */
  get(...params) {
    const results = this.all(...params);
    return results[0];
  }

  /**
   * INSERT/UPDATE/DELETE
   * @param {...any} params
   * @returns {{lastInsertRowid: number, changes: number}}
   */
  run(...params) {
    let bindParams;
    if (params.length === 1 && params[0] !== null && typeof params[0] === 'object' && !Array.isArray(params[0])) {
      bindParams = this.convertParams(params[0]);
    } else if (params.length > 0) {
      bindParams = params;
    } else {
      bindParams = {};
    }

    let stmt;
    try {
      stmt = this.wrapper.db.prepare(this.sql);
      stmt.bind(bindParams);
      stmt.step();
    } finally {
      if (stmt) stmt.free();
    }

    // Änderungen tracken
    this.wrapper.markDirty();

    // lastInsertRowid emulieren
    let lastRowid = 0;
    try {
      const result = this.wrapper.db.exec('SELECT last_insert_rowid()');
      if (result.length > 0 && result[0].values.length > 0) {
        lastRowid = result[0].values[0][0];
      }
    } catch (e) {
      // Ignorieren
    }

    // changes emulieren
    let changes = 0;
    try {
      changes = this.wrapper.db.getRowsModified();
    } catch (e) {
      // Ignorieren
    }

    return {
      lastInsertRowid: lastRowid,
      changes: changes
    };
  }
}

module.exports = SqlJsWrapper;
