"use strict";
// ============================================================
// AWS CLI Quest — autocomplete.js
// Tab completa serviço → comando → flags no terminal e lista as opções.
// NÃO altera o core: anexa o próprio listener de Tab ao #entradaTerminal
// (o listener do app.js cuida de Enter/setas e ignora o Tab).
// ============================================================

// Flags conhecidas por "serviço comando" (pra completar com Tab).
const FLAGS_POR_COMANDO = {
  "s3 rb": ["--force"],
  "s3 website": ["--index-document", "--error-document"],
  "s3api create-bucket": ["--bucket", "--region"],
  "s3api put-bucket-versioning": ["--bucket", "--versioning-configuration"],
  "s3api get-bucket-versioning": ["--bucket"],
  "s3api put-bucket-policy": ["--bucket", "--policy"],
  "s3api get-bucket-policy": ["--bucket"],
  "ec2 run-instances": ["--image-id", "--instance-type", "--count", "--key-name", "--security-groups"],
  "ec2 stop-instances": ["--instance-ids"],
  "ec2 start-instances": ["--instance-ids"],
  "ec2 terminate-instances": ["--instance-ids"],
  "ec2 create-key-pair": ["--key-name"],
  "ec2 create-security-group": ["--group-name", "--description"],
  "ec2 authorize-security-group-ingress": ["--group-name", "--group-id", "--protocol", "--port", "--cidr"],
  "iam create-user": ["--user-name"],
  "iam delete-user": ["--user-name"],
  "iam create-group": ["--group-name"],
  "iam add-user-to-group": ["--user-name", "--group-name"],
  "iam get-group": ["--group-name"],
  "iam attach-user-policy": ["--user-name", "--policy-arn"],
  "iam attach-group-policy": ["--group-name", "--policy-arn"],
  "iam list-attached-user-policies": ["--user-name"],
  "iam create-role": ["--role-name", "--assume-role-policy-document"],
  "iam attach-role-policy": ["--role-name", "--policy-arn"],
  "lambda create-function": ["--function-name", "--runtime", "--role", "--handler", "--zip-file"],
  "lambda get-function": ["--function-name"],
  "lambda invoke": ["--function-name"],
  "lambda update-function-configuration": ["--function-name", "--timeout", "--memory-size", "--environment"],
  "lambda delete-function": ["--function-name"],
  "dynamodb create-table": ["--table-name", "--attribute-definitions", "--key-schema", "--billing-mode", "--provisioned-throughput"],
  "dynamodb describe-table": ["--table-name"],
  "dynamodb put-item": ["--table-name", "--item"],
  "dynamodb get-item": ["--table-name", "--key"],
  "dynamodb scan": ["--table-name"],
  "dynamodb delete-table": ["--table-name"],
};

function prefixoComum(lista) {
  if (!lista.length) return "";
  let pre = lista[0];
  for (const s of lista) {
    while (!s.startsWith(pre)) pre = pre.slice(0, -1);
    if (!pre) break;
  }
  return pre;
}

// Calcula os candidatos pro token que está sendo digitado.
function candidatos(base, partial) {
  // base = tokens já confirmados antes do token parcial
  let universo = [];
  if (base.length === 0) {
    universo = ["aws", "ls", "clear", "help"];
  } else if (base[0] !== "aws") {
    return [];
  } else if (base.length === 1) {
    universo = [...Object.keys(SERVICOS), "help", "configure"];
  } else if (base.length === 2) {
    const ops = SERVICOS[base[1]];
    universo = ops ? [...Object.keys(ops), "help"] : ["help"];
  } else {
    // flags — só sugere se o token parecer uma flag (começa com - ou vazio)
    if (partial && !partial.startsWith("-")) return [];
    const chave = base[1] + " " + base[2];
    const flags = FLAGS_POR_COMANDO[chave] || [];
    const jaUsadas = new Set(base.filter((t) => t.startsWith("--")));
    universo = flags.filter((f) => !jaUsadas.has(f));
  }
  return universo.filter((c) => c.startsWith(partial));
}

function aoApertarTab(ev, input) {
  ev.preventDefault();
  const valor = input.value;
  const terminaEspaco = /\s$/.test(valor);
  const partes = valor.trim().length ? valor.trim().split(/\s+/) : [];
  const partial = terminaEspaco ? "" : (partes.length ? partes[partes.length - 1] : "");
  const base = terminaEspaco ? partes : partes.slice(0, -1);

  const cands = candidatos(base, partial);
  if (!cands.length) return;

  const prefixoBase = base.length ? base.join(" ") + " " : "";

  if (cands.length === 1) {
    input.value = prefixoBase + cands[0] + " ";
  } else {
    const comum = prefixoComum(cands);
    if (comum.length > partial.length) {
      input.value = prefixoBase + comum;
    } else {
      // sem como avançar sozinho: lista as opções no terminal
      if (typeof imprimir === "function") {
        imprimir(`aws-quest $ ${valor}`, "eco-tab");
        imprimir(cands.join("    "), "sugestao");
        if (typeof rolarTerminal === "function") rolarTerminal();
      }
    }
  }
  input.setSelectionRange(input.value.length, input.value.length);
}

document.addEventListener("DOMContentLoaded", () => {
  const input = document.querySelector("#entradaTerminal");
  if (!input) return;
  input.addEventListener("keydown", (ev) => {
    if (ev.key === "Tab") aoApertarTab(ev, input);
  });
});
