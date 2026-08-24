// Minimal browser-based test runner (no dependencies).
(function () {
  const results = [];

  function assertEqual(actual, expected, msg) {
    const a = JSON.stringify(actual);
    const e = JSON.stringify(expected);
    if (a !== e) {
      throw new Error((msg ? msg + ' — ' : '') + `expected ${e}, got ${a}`);
    }
  }

  function assertClose(actual, expected, tolerance, msg) {
    tolerance = tolerance === undefined ? 0.01 : tolerance;
    if (Math.abs(actual - expected) > tolerance) {
      throw new Error((msg ? msg + ' — ' : '') + `expected ~${expected}, got ${actual}`);
    }
  }

  function assertTrue(cond, msg) {
    if (!cond) throw new Error(msg || 'expected truthy value');
  }

  function test(name, fn) {
    try {
      fn();
      results.push({ name, pass: true });
    } catch (err) {
      results.push({ name, pass: false, error: err.message });
    }
  }

  function report() {
    const passCount = results.filter(r => r.pass).length;
    const failCount = results.length - passCount;
    const out = document.getElementById('output');
    let html = `<h2>${passCount} passed, ${failCount} failed (of ${results.length})</h2><ul>`;
    for (const r of results) {
      html += `<li style="color:${r.pass ? 'green' : 'crimson'}">${r.pass ? 'PASS' : 'FAIL'} — ${r.name}${r.error ? ' :: ' + r.error : ''}</li>`;
      console.log((r.pass ? '[PASS] ' : '[FAIL] ') + r.name + (r.error ? ' :: ' + r.error : ''));
    }
    html += '</ul>';
    out.innerHTML = html;
    console.log(`SUMMARY: ${passCount} passed, ${failCount} failed`);
  }

  window.TestKit = { test, assertEqual, assertClose, assertTrue, report };
})();
