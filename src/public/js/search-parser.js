/* nodepulse - Advanced Search Query Parser
   ES5 compatible for Chrome 50+, Fire HD 10 2017

   Parses advanced search queries like:
   - "cpu>80 ram<20 tags:prod"
   - "node:pve1, memory>50, status:online"

   Returns:
   {
     text: "free text search",
     conditions: [
       { field: "cpu", op: ">", value: 80 },
       { field: "ram", op: "<", value: 20 },
       { field: "tags", op: ":", value: "prod" }
     ]
   }
*/

(function() {
  'use strict';

  /**
   * Parse search query into conditions
   * @param {string} query - Search query string
   * @returns {Object} { text: string, conditions: Array }
   */
  function parseSearchQuery(query) {
    if (!query || typeof query !== 'string') {
      return { text: '', conditions: [] };
    }

    var result = {
      text: '',
      conditions: []
    };

    // Supported operators (order matters - check >= before >)
    var operators = ['>=', '<=', '!=', '>', '<', '=', ':'];

    // Supported fields
    var validFields = [
      'cpu', 'ram', 'disk', 'memory', 'storage',
      'node', 'name', 'host',
      'tags', 'tag',
      'type', 'status',
      'vms', 'containers', 'uptime'
    ];

    // Split by comma or space (but preserve quoted strings)
    var tokens = tokenize(query);
    var textParts = [];

    for (var i = 0; i < tokens.length; i++) {
      var token = tokens[i].trim();
      if (!token) continue;

      var parsed = parseToken(token, operators, validFields);

      if (parsed.isCondition) {
        result.conditions.push({
          field: parsed.field,
          op: parsed.op,
          value: parsed.value
        });
      } else {
        // Free text search
        textParts.push(token);
      }
    }

    result.text = textParts.join(' ').trim();
    return result;
  }

  /**
   * Tokenize query string (split by comma/space, preserve quotes)
   * @param {string} query - Raw query string
   * @returns {Array} Array of tokens
   */
  function tokenize(query) {
    var tokens = [];
    var current = '';
    var inQuote = false;
    var quoteChar = null;

    for (var i = 0; i < query.length; i++) {
      var char = query[i];

      // Handle quotes
      if (char === '"' || char === "'") {
        if (!inQuote) {
          inQuote = true;
          quoteChar = char;
          current += char;
        } else if (char === quoteChar) {
          inQuote = false;
          quoteChar = null;
          current += char;
        } else {
          current += char;
        }
        continue;
      }

      // Split on comma or space (if not in quote)
      if (!inQuote && (char === ',' || char === ' ')) {
        if (current.trim()) {
          tokens.push(current.trim());
          current = '';
        }
        continue;
      }

      current += char;
    }

    // Push remaining
    if (current.trim()) {
      tokens.push(current.trim());
    }

    return tokens;
  }

  /**
   * Parse a single token into condition or text
   * @param {string} token - Single token string
   * @param {Array} operators - Supported operators
   * @param {Array} validFields - Valid field names
   * @returns {Object} { isCondition: boolean, field: string, op: string, value: any }
   */
  function parseToken(token, operators, validFields) {
    // Try each operator (longest first)
    for (var i = 0; i < operators.length; i++) {
      var op = operators[i];
      var index = token.indexOf(op);

      if (index === -1) continue;

      var field = token.substring(0, index).trim().toLowerCase();
      var valueStr = token.substring(index + op.length).trim();

      // Check if field is valid
      if (validFields.indexOf(field) === -1) {
        continue;
      }

      // Normalize field aliases
      if (field === 'memory') field = 'ram';
      if (field === 'storage') field = 'disk';
      if (field === 'tag') field = 'tags';
      if (field === 'name') field = 'node';

      // Parse value
      var value = parseValue(valueStr);

      return {
        isCondition: true,
        field: field,
        op: op,
        value: value
      };
    }

    // Not a condition - free text
    return {
      isCondition: false
    };
  }

  /**
   * Parse value string to correct type
   * @param {string} valueStr - Value string
   * @returns {any} Parsed value (number, boolean, or string)
   */
  function parseValue(valueStr) {
    // Remove quotes
    if ((valueStr[0] === '"' && valueStr[valueStr.length - 1] === '"') ||
        (valueStr[0] === "'" && valueStr[valueStr.length - 1] === "'")) {
      return valueStr.substring(1, valueStr.length - 1);
    }

    // Try parse as number
    var num = parseFloat(valueStr);
    if (!isNaN(num) && valueStr === num.toString()) {
      return num;
    }

    // Boolean
    if (valueStr.toLowerCase() === 'true') return true;
    if (valueStr.toLowerCase() === 'false') return false;

    // String
    return valueStr;
  }

  /**
   * Match node against parsed query
   * @param {Object} node - Node data object
   * @param {Object} parsedQuery - Result from parseSearchQuery()
   * @returns {boolean} True if node matches
   */
  function matchNode(node, parsedQuery) {
    // Free text search (name, host, type)
    if (parsedQuery.text) {
      var text = parsedQuery.text.toLowerCase();
      var searchFields = [
        (node.name || '').toLowerCase(),
        (node.host || '').toLowerCase(),
        (node.node_type || '').toLowerCase()
      ].join(' ');

      if (searchFields.indexOf(text) === -1) {
        return false;
      }
    }

    // Conditions
    for (var i = 0; i < parsedQuery.conditions.length; i++) {
      var cond = parsedQuery.conditions[i];
      if (!matchCondition(node, cond)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Match single condition against node
   * @param {Object} node - Node data object
   * @param {Object} cond - Condition object { field, op, value }
   * @returns {boolean} True if condition matches
   */
  function matchCondition(node, cond) {
    var nodeValue = getNodeValue(node, cond.field);

    // Null/undefined handling
    if (nodeValue === null || nodeValue === undefined) {
      return false;
    }

    // String comparison for colon operator
    if (cond.op === ':') {
      var nodeStr = String(nodeValue).toLowerCase();
      var condStr = String(cond.value).toLowerCase();
      return nodeStr.indexOf(condStr) !== -1;
    }

    // Numeric/Boolean comparison
    switch (cond.op) {
      case '>':
        return Number(nodeValue) > Number(cond.value);
      case '<':
        return Number(nodeValue) < Number(cond.value);
      case '>=':
        return Number(nodeValue) >= Number(cond.value);
      case '<=':
        return Number(nodeValue) <= Number(cond.value);
      case '=':
        return nodeValue === cond.value;
      case '!=':
        return nodeValue !== cond.value;
      default:
        return false;
    }
  }

  /**
   * Get node value by field name
   * @param {Object} node - Node data object
   * @param {string} field - Field name
   * @returns {any} Field value
   */
  function getNodeValue(node, field) {
    switch (field) {
      case 'cpu':
        return node.cpu_percent;
      case 'ram':
      case 'memory':
        return node.ram_percent;
      case 'disk':
      case 'storage':
        return node.disk_percent;
      case 'node':
      case 'name':
        return node.name;
      case 'host':
        return node.host;
      case 'tags':
      case 'tag':
        return node.tags || '';
      case 'type':
        return node.node_type;
      case 'status':
        return node.online ? 'online' : 'offline';
      case 'vms':
        return (node.vms_running || 0) + (node.cts_running || 0);
      case 'containers':
        return node.containers_running || 0;
      case 'uptime':
        return node.uptime_seconds || 0;
      default:
        return null;
    }
  }

  // Export functions
  window.parseSearchQuery = parseSearchQuery;
  window.matchNode = matchNode;

  // Also export to NP namespace if available
  if (window.NP) {
    window.NP.Search = {
      parseSearchQuery: parseSearchQuery,
      matchNode: matchNode
    };
  }
})();
