"use strict";
// ============================================================
// CLImb — idioma.js        (i18n: ignorar-arquivo)
// Português, inglês e espanhol. Este arquivo NÃO traduz nada: quem traduz é o
// servidor (lib/i18n.js), que entrega cada JS com os textos já trocados
// conforme o cookie climb_idioma. Aqui ficam só três coisas:
//
//   1. trocar de idioma: grava o cookie e recarrega a página (o servidor
//      precisa mandar os arquivos de novo, no idioma novo);
//   2. o botão "🌐 Idioma" no menu Você, que abre a escolha;
//   3. a SUGESTÃO pelo lugar onde a pessoa está: o fuso horário do aparelho
//      diz o país (sem pedir permissão e sem serviço de geolocalização), e a
//      faixa no rodapé sugere o idioma de lá. É sugestão, nunca troca sozinha:
//      o Googlebot e quem está no Brasil com o aparelho em inglês continuam
//      vendo o site em português até escolherem.
//
// A marca "i18n: ignorar-arquivo" lá em cima é o que impede o servidor de
// passar este arquivo pelo dicionário: ele já traz os três idiomas lado a lado,
// e traduzir o "pt" daqui quebraria os rótulos.
// ============================================================
(function () {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  const IDIOMAS = ["pt", "en", "es"];
  const NOMES = { pt: "Português", en: "English", es: "Español" };
  const CHAVE_DISPENSA = "climb.idioma.sugestao";

  const TXT = {
    pt: {
      botao: "Idioma", titulo: "🌐 Idioma do CLImb", fechar: "Fechar",
      explica: "Muda a interface, as atividades, as lições e o simulado. Os comandos continuam os mesmos: o AWS CLI é em inglês em qualquer idioma.",
      sugere: "O CLImb também está em português.", trocar: "Usar em português", manter: "Continuar em",
    },
    en: {
      botao: "Language", titulo: "🌐 CLImb language", fechar: "Close",
      explica: "Changes the interface, the activities, the lessons and the practice exam. Commands stay the same: the AWS CLI is in English in every language.",
      sugere: "CLImb is also available in English.", trocar: "Switch to English", manter: "Keep",
    },
    es: {
      botao: "Idioma", titulo: "🌐 Idioma de CLImb", fechar: "Cerrar",
      explica: "Cambia la interfaz, las actividades, las lecciones y el simulador de examen. Los comandos siguen iguales: el AWS CLI está en inglés en cualquier idioma.",
      sugere: "CLImb también está disponible en español.", trocar: "Usar en español", manter: "Seguir en",
    },
  };
  // "Continuar em português" / "Keep Portuguese" / "Seguir en portugués"
  const NOME_NO_IDIOMA = {
    pt: { pt: "português", en: "inglês", es: "espanhol" },
    en: { pt: "Portuguese", en: "English", es: "Spanish" },
    es: { pt: "portugués", en: "inglés", es: "español" },
  };

  function lerCookie() {
    const m = document.cookie.match(/(?:^|;\s*)climb_idioma=([a-z]{2})/);
    return m && IDIOMAS.includes(m[1]) ? m[1] : null;
  }
  const atual = lerCookie() || "pt";
  window.CLIMB_IDIOMA = atual;

  function trocarIdioma(idioma) {
    if (!IDIOMAS.includes(idioma)) return;
    document.cookie = "climb_idioma=" + idioma + "; path=/; max-age=31536000; SameSite=Lax" +
      (location.protocol === "https:" ? "; Secure" : "");
    try { localStorage.setItem(CHAVE_DISPENSA, "escolheu"); } catch (e) { /* ok */ }
    if (idioma !== atual) location.reload();
  }
  window.trocarIdioma = trocarIdioma;

  // ---------- onde a pessoa está ----------
  // Fuso horário -> idioma do país. Brasil e Portugal (e os países africanos
  // de língua portuguesa) ficam no português; a América hispânica e a Espanha,
  // no espanhol; o resto do mundo, no inglês.
  const FUSOS_PT = /^(America\/(Sao_Paulo|Bahia|Fortaleza|Recife|Maceio|Belem|Manaus|Cuiaba|Campo_Grande|Porto_Velho|Boa_Vista|Rio_Branco|Eirunepe|Araguaina|Santarem|Noronha)|Brazil\/|Europe\/Lisbon|Atlantic\/(Azores|Madeira)|Africa\/(Luanda|Maputo|Bissau|Sao_Tome)|Atlantic\/Cape_Verde|Asia\/Dili)/;
  const FUSOS_ES = /^(Europe\/Madrid|Africa\/Ceuta|Atlantic\/Canary|America\/(Mexico_City|Cancun|Merida|Monterrey|Matamoros|Chihuahua|Ciudad_Juarez|Ojinaga|Hermosillo|Mazatlan|Bahia_Banderas|Tijuana|Bogota|Lima|Santiago|Punta_Arenas|Argentina\/[A-Za-z_]+|Buenos_Aires|Cordoba|Mendoza|Caracas|Montevideo|Asuncion|La_Paz|Guayaquil|Costa_Rica|Panama|Guatemala|El_Salvador|Tegucigalpa|Managua|Santo_Domingo|Havana|Puerto_Rico)|Pacific\/(Galapagos|Easter)|Africa\/Malabo)/;

  function idiomaDoLugar() {
    let fuso = "";
    try { fuso = Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch (e) { return null; }
    if (!fuso) return null;
    if (FUSOS_PT.test(fuso)) return "pt";
    if (FUSOS_ES.test(fuso)) return "es";
    return "en";
  }
  function idiomaDoNavegador() {
    const l = String((navigator.languages && navigator.languages[0]) || navigator.language || "").slice(0, 2).toLowerCase();
    return IDIOMAS.includes(l) ? l : null;
  }

  // ---------- faixa de sugestão ----------
  function sugerir() {
    if (lerCookie()) return; // já escolheu um idioma alguma vez: não insiste
    let dispensada = null;
    try { dispensada = localStorage.getItem(CHAVE_DISPENSA); } catch (e) { /* ok */ }
    if (dispensada) return;
    const lugar = idiomaDoLugar();
    if (!lugar || lugar === atual) return;
    // aparelho no idioma atual (um brasileiro viajando, por exemplo): não incomoda
    if (idiomaDoNavegador() === atual) return;
    if (/bot|crawl|spider|lighthouse/i.test(navigator.userAgent)) return;
    mostrarFaixa(lugar);
  }

  function mostrarFaixa(sugerido) {
    if (document.getElementById("faixaIdioma")) return;
    const t = TXT[sugerido];
    const faixa = document.createElement("div");
    faixa.id = "faixaIdioma";
    faixa.setAttribute("role", "region");
    faixa.setAttribute("aria-label", t.titulo.replace(/^\S+\s/, ""));
    faixa.setAttribute("lang", sugerido);
    faixa.style.cssText = "position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:100001;" +
      "max-width:calc(100vw - 32px);box-sizing:border-box;display:flex;flex-wrap:wrap;align-items:center;gap:8px 12px;" +
      "padding:10px 14px;border-radius:10px;background:#0f1b2d;color:#f4f6fa;border:1px solid #34425e;" +
      "box-shadow:0 6px 24px rgba(0,0,0,.35);font:14px/1.4 system-ui,-apple-system,'Segoe UI',sans-serif";
    const msg = document.createElement("span");
    msg.textContent = "🌎 " + t.sugere;
    const sim = document.createElement("button");
    sim.type = "button";
    sim.textContent = t.trocar;
    sim.style.cssText = "background:#ff9900;color:#111;border:0;border-radius:6px;padding:6px 12px;font:inherit;font-weight:600;cursor:pointer";
    sim.addEventListener("click", () => trocarIdioma(sugerido));
    const nao = document.createElement("button");
    nao.type = "button";
    nao.textContent = t.manter + " " + NOME_NO_IDIOMA[sugerido][atual];
    nao.style.cssText = "background:transparent;color:#f4f6fa;border:1px solid #6b7a96;border-radius:6px;padding:6px 12px;font:inherit;cursor:pointer";
    nao.addEventListener("click", () => {
      try { localStorage.setItem(CHAVE_DISPENSA, "dispensou"); } catch (e) { /* ok */ }
      faixa.remove();
    });
    faixa.append(msg, sim, nao);
    document.body.appendChild(faixa);
  }

  // ---------- janela de escolha ----------
  function abrirEscolha() {
    let m = document.getElementById("modalIdioma");
    if (!m) {
      const t = TXT[atual];
      m = document.createElement("div");
      m.className = "modal";
      m.id = "modalIdioma";
      m.setAttribute("role", "dialog");
      m.setAttribute("aria-modal", "true");
      m.setAttribute("aria-labelledby", "modalIdiomaTitulo");
      const caixa = document.createElement("div");
      caixa.className = "modal-caixa";
      const h = document.createElement("h2");
      h.id = "modalIdiomaTitulo";
      h.textContent = t.titulo;
      const p = document.createElement("p");
      p.textContent = t.explica;
      const lista = document.createElement("div");
      lista.className = "modal-acoes";
      lista.style.justifyContent = "flex-start";
      lista.style.flexWrap = "wrap";
      for (const l of IDIOMAS) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "botao" + (l === atual ? "" : " secundario");
        b.lang = l;
        b.textContent = NOMES[l];
        if (l === atual) b.setAttribute("aria-current", "true");
        b.addEventListener("click", () => (l === atual ? fechar() : trocarIdioma(l)));
        lista.appendChild(b);
      }
      const acoes = document.createElement("div");
      acoes.className = "modal-acoes";
      const f = document.createElement("button");
      f.type = "button";
      f.className = "botao secundario";
      f.textContent = t.fechar;
      f.addEventListener("click", fechar);
      acoes.appendChild(f);
      caixa.append(h, p, lista, acoes);
      m.appendChild(caixa);
      m.addEventListener("click", (e) => { if (e.target === m) fechar(); });
      document.body.appendChild(m);
    }
    m.classList.add("aberto");
    const primeiro = m.querySelector("button[aria-current]") || m.querySelector("button");
    if (primeiro) primeiro.focus();
    document.addEventListener("keydown", esc);
  }
  function esc(e) { if (e.key === "Escape") fechar(); }
  function fechar() {
    const m = document.getElementById("modalIdioma");
    if (m) m.classList.remove("aberto");
    document.removeEventListener("keydown", esc);
  }
  window.abrirEscolhaIdioma = abrirEscolha;

  // ---------- botão no menu Você ----------
  function criarBotao() {
    if (document.getElementById("btnIdioma")) return;
    const ref = document.getElementById("btnEnxuta") || document.getElementById("btnDestaque") || document.getElementById("btnTema");
    if (!ref || !ref.parentNode) return;
    const b = document.createElement("button");
    b.type = "button";
    b.id = "btnIdioma";
    b.className = "botao secundario";
    b.textContent = "🌐 " + TXT[atual].botao + ": " + NOMES[atual];
    b.addEventListener("click", abrirEscolha);
    ref.parentNode.insertBefore(b, ref.nextSibling);
  }

  // Seletor da capa: links PT · EN · ES que o capa.js desenha com data-idioma.
  document.addEventListener("click", (e) => {
    const a = e.target.closest && e.target.closest("[data-idioma]");
    if (!a) return;
    e.preventDefault();
    trocarIdioma(a.getAttribute("data-idioma"));
  });

  function iniciar() {
    // depois do tela-enxuta.js, que cria o #btnEnxuta no DOMContentLoaded
    setTimeout(criarBotao, 0);
    // a faixa espera a página assentar: não disputa a primeira pintura
    if (document.readyState === "complete") setTimeout(sugerir, 1500);
    else window.addEventListener("load", () => setTimeout(sugerir, 1500));
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar);
  else iniciar();
})();
