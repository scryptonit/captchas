(() => {
  const results = [];

  function addResult(type, data = {}) {
    results.push({ "CAPTCHA Type": type, ...data });
  }

  const html = document.documentElement.innerHTML || "";

  // 1. Google reCAPTCHA
  (() => {
    const data = {};
    const script = [...document.scripts].find(s => /recaptcha\/(api|enterprise)\.js/.test(s.src));
    let type = null;

    if (script) {
      const src = script.src;
      const isEnt = src.includes("enterprise");
      const render = src.match(/[?&]render=([^&]+)/);
      if (render && render[1] !== "explicit") {
        data.sitekey = render[1];
        type = isEnt ? "reCAPTCHA v3 Enterprise" : "reCAPTCHA v3";
      } else {
        const el = document.querySelector("[data-sitekey]");
        if (el) {
          data.sitekey = el.getAttribute("data-sitekey");
          const size = el.getAttribute("data-size");
          const cb = el.getAttribute("data-callback");
          if (isEnt) {
            type = "reCAPTCHA v2 Enterprise";
          } else if (size === "invisible") {
            type = "reCAPTCHA v2 Invisible";
          } else if (cb) {
            type = "reCAPTCHA v2 (Callback)";
            data.callback = cb;
          } else {
            type = "reCAPTCHA v2";
          }
        }
      }
    } else if (window.grecaptcha) {
      const el = document.querySelector("[data-sitekey]");
      if (el) data.sitekey = el.getAttribute("data-sitekey");
      type = window.grecaptcha.enterprise ? "reCAPTCHA v2 Enterprise" : "reCAPTCHA v2";
    }

    if (type) addResult(type, data);
  })();

  // 2. hCaptcha
  (() => {
    const hcaptchaElement = document.querySelector(".h-captcha[data-sitekey]");
    const hcaptchaScript = [...document.scripts].find(s =>
      s.src.includes("js.hcaptcha.com") || s.src.includes("hcaptcha.com/1/api.js")
    );
    const isHcaptcha = !!hcaptchaElement || !!hcaptchaScript || typeof window.hcaptcha !== "undefined";

    if (isHcaptcha) {
      const data = {
        sitekey: hcaptchaElement?.getAttribute("data-sitekey") || "(not found)",
        size: hcaptchaElement?.getAttribute("data-size") || "(default)",
        theme: hcaptchaElement?.getAttribute("data-theme") || "(default)",
        endpoint: hcaptchaElement?.getAttribute("data-endpoint") || "(default)",
        callback: hcaptchaElement?.getAttribute("data-callback") || "(none)"
      };

      const type = data.size === "invisible" ? "hCaptcha Invisible" : "hCaptcha";
      addResult(type, data);
    }
  })();

  // 3. GeeTest
  (() => {
    const data = {};
    let type = null;
    const idMatch = html.match(/captcha_id['"]?\s*[:=]\s*['"]([^'"]+)['"]/i);
    if (idMatch) {
      type = "GeeTest CAPTCHA v4";
      data.captcha_id = idMatch[1];
    } else if (typeof window.initGeetest4 !== "undefined") {
      type = "GeeTest CAPTCHA v4";
      data.captcha_id = "(via initGeetest4)";
    } else {
      const gt = html.match(/gt['"]?\s*[:=]\s*['"]([0-9a-fA-F]{32})['"]/);
      const ch = html.match(/challenge['"]?\s*[:=]\s*['"]([0-9a-zA-Z_-]+)['"]/);
      if (gt && ch) {
        type = "GeeTest CAPTCHA v3";
        data.gt = gt[1];
        data.challenge = ch[1];
      } else {
        const script = [...document.scripts].find(s => s.src.includes("gt=") && s.src.includes("challenge="));
        if (script) {
          const params = new URL(script.src).searchParams;
          data.gt = params.get("gt");
          data.challenge = params.get("challenge");
          type = "GeeTest CAPTCHA v3";
        } else if (typeof window.initGeetest !== "undefined") {
          type = "GeeTest CAPTCHA v3";
          data.notice = "initGeetest detected (gt/challenge might be dynamic)";
        }
      }
    }
    if (type) addResult(type, data);
  })();

  // 4. Solve Media
  (() => {
    const script = [...document.scripts].find(s => s.src.includes("solvemedia.com/papi/challenge"));
    const frame = document.querySelector('iframe[src*="solvemedia.com/papi/challenge"]');
    let sitekey = null;
    try {
      if (script) sitekey = new URL(script.src).searchParams.get("k");
      else if (frame) sitekey = new URL(frame.src).searchParams.get("k");
    } catch {}
    if (sitekey) addResult("Solve Media CAPTCHA", { sitekey });
  })();

  // 5. Cloudflare Turnstile
  (() => {
    const div = document.querySelector(".cf-turnstile[data-sitekey]");
    const frame = document.querySelector('iframe[src*="/turnstile/"]');
    if (div) {
      addResult("Cloudflare Turnstile", { sitekey: div.getAttribute("data-sitekey") });
    } else if (frame) {
      addResult("Cloudflare Turnstile", { notice: "Turnstile iframe detected, no sitekey in HTML" });
    }
  })();

  // 6. Lemin
  (() => {
    const script = [...document.scripts].find(s => s.src.includes("api.leminnow.com/captcha/"));
    if (script) {
      const data = { api_server: "api.leminnow.com" };
      try {
        const parts = new URL(script.src).pathname.split("/");
        if (parts.length >= 2) data.captcha_id = parts.at(-2);
      } catch {}
      const div = document.querySelector('div[id^="lemin"]');
      if (div) data.div_id = div.id;
      addResult("Lemin CAPTCHA", data);
    }
  })();

  // 7. MTCaptcha
  (() => {
    let sitekey = window.mtcaptchaConfig?.sitekey;
    if (!sitekey && typeof window.mtcaptcha?.getConfiguration === "function") {
      try {
        sitekey = window.mtcaptcha.getConfiguration().sitekey;
      } catch {}
    }
    if (!sitekey) {
      const m = html.match(/MTPublic-[0-9A-Za-z]+/);
      if (m) sitekey = m[0];
    }
    if (sitekey) addResult("MTCaptcha", { sitekey });
  })();

  // 8. FunCaptcha (Arkose)
  (() => {
    const data = {};
    const tokenInput = document.querySelector('input[name="fc-token"]');
    const dataPkeyElem = document.querySelector('[data-pkey]');
    const arkoseScript = [...document.scripts].find(s =>
      s.src && (s.src.includes("funcaptcha.com") || s.src.includes("arkoselabs.com"))
    );

    if (tokenInput && tokenInput.value) {
      const token = tokenInput.value;
      const pk = token.match(/pk=([0-9A-Z-]+)/i);
      const surl = token.match(/surl=([^|&]+)/i);
      if (pk) data.public_key = pk[1];
      if (surl) {
        try {
          data.surl = decodeURIComponent(surl[1]);
        } catch {
          data.surl = surl[1];
        }
      }
    }

    if (!data.public_key && dataPkeyElem) {
      data.public_key = dataPkeyElem.getAttribute("data-pkey");
    }

    if (!data.public_key && typeof window.AnoCaptcha !== "undefined") {
      data.notice = "Arkose Labs object detected (no key found)";
    }

    if (!data.public_key && arkoseScript) {
      const pkMatch = arkoseScript.src.match(/[?&]pkey=([0-9A-Z-]+)/i);
      if (pkMatch) data.public_key = pkMatch[1];
    }

    if (Object.keys(data).length) {
      addResult("Arkose Labs FunCaptcha (Rotate)", data);
    }
  })();

  // 9. Normal Image CAPTCHA
  (() => {
    const img = document.querySelector('img[src*="captcha"]');
    if (img) {
      const form = img.closest("form") || document;
      const input = form.querySelector('input[type="text"]');
      addResult(input ? "Normal Image CAPTCHA" : "Click Image CAPTCHA", { image_src: img.src });
    }
  })();

  // 10. Text CAPTCHA
  (() => {
    const input = document.querySelector('input[type="text"]:not([name="captcha"])');
    if (input) {
      let text = input.placeholder || "";
      if (!text) {
        const label = input.closest("label");
        if (label) text = label.innerText;
        else {
          const prev = input.previousSibling;
          if (prev?.nodeType === Node.TEXT_NODE) text = prev.textContent.trim();
        }
      }
      if (text.includes("?") || /\bsolve\b/i.test(text)) {
        addResult("Text CAPTCHA", { question: text });
      }
    }
  })();





  
  if (results.length === 0) {
    console.log("%cNo known CAPTCHA types detected.", "color: gray;");
  } else {
    console.log("%c🔍 Detected CAPTCHA types:", "font-weight: bold; color: green;");
    console.table(results);
  }
})();
