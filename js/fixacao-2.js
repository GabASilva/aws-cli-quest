"use strict";
// ============================================================
// CLImb — fixacao-2.js
// Reforço do laboratório de diagnóstico de rede (trilha "diagnostico").
// Separado do fixacao-1.js porque as atividades diag-* nascem no lab-vpc.js,
// que carrega DEPOIS dele: ancorado lá, o at() caía no push (âncora perdida).
// Carrega logo depois do lab-vpc.js. Prefixo fx-, estrito no analise.
// ============================================================
(function () {
  if (typeof DESAFIOS === "undefined") return;
  const g = typeof globalThis !== "undefined" ? globalThis : window;
  const perdida = (id) => { (g.__ancorasPerdidas = g.__ancorasPerdidas || []).push(id); };
  function d(id, servico, nivel, xp, titulo, descricao, dicas, solucao, validar) {
    return { id, servico, nivel, xp, titulo, descricao, dicas, solucao, validar };
  }
  function at(anchorId, novos) {
    const i = DESAFIOS.findIndex((x) => x.id === anchorId);
    if (i < 0) { perdida(anchorId); for (const n of novos) DESAFIOS.push(n); return; }
    DESAFIOS.splice(i + 1, 0, ...novos);
  }
  function mover(ids, depoisDe) {
    const tirados = [];
    for (const id of ids) {
      const i = DESAFIOS.findIndex((x) => x.id === id);
      if (i < 0) { perdida(id); continue; }
      tirados.push(DESAFIOS.splice(i, 1)[0]);
    }
    const j = DESAFIOS.findIndex((x) => x.id === depoisDe);
    if (j < 0) { perdida(depoisDe); DESAFIOS.push(...tirados); return; }
    DESAFIOS.splice(j + 1, 0, ...tirados);
  }

  // cob-vpc-4 (nível 3, criar regra na ACL) abria a trilha, e cob-vpc-7
  // apagava o flow log ANTES de ele ser criado no diag-2. Agora a regra nova
  // vem depois de consertar a ACL, e parar a gravação fecha a investigação.
  mover(["cob-vpc-4"], "diag-10");
  mover(["cob-vpc-7"], "diag-13");
  const flowLogs = (c) => Object.values(((c.vpc || {}).flowLogs) || {});
  at("diag-3", [
    d("fx-diag-fl2", "diagnostico", 2, 90, "Uma câmera só pras rejeições",
      "Depois do incidente, a segurança quer guardar pra sempre só o que foi <b>rejeitado</b> — é bem menos volume que o ALL. Crie um segundo flow log na mesma VPC, com tráfego <b>REJECT</b>, no mesmo bucket.",
      ["Mesmo `create-flow-logs`, outro `--traffic-type`."],
      ["aws ec2 create-flow-logs --resource-type VPC --resource-ids <vpc-id> --traffic-type REJECT --log-destination-type s3 --log-destination arn:aws:s3:::flowlogs-loja"],
      (c) => flowLogs(c).some((f) => f.trafego === "REJECT")),
    d("fx-diag-dfl2", "diagnostico", 2, 70, "Quais câmeras estão ligadas?",
      "Confira que agora são duas gravações, cada uma com o seu tipo de tráfego.",
      ["Mesmo `describe-flow-logs`, com `--query`.", "O caminho é `FlowLogs[].TrafficType`."],
      ["aws ec2 describe-flow-logs --query FlowLogs[].TrafficType"],
      (c, cmd, ok) => ok && ehCmd(cmd, "ec2", "describe-flow-logs") && /TrafficType/.test(String(cmd.flags.query || ""))),
  ]);
  at("diag-4", [
    d("fx-diag-sg2", "diagnostico", 3, 80, "Só o firewall do servidor",
      "A lista de security groups vem com tudo da conta. Olhe só o do servidor do laboratório, pelo id dele.",
      ["O `describe-security-groups` aceita `--group-ids`.", "O id do grupo do servidor aparece na listagem da atividade anterior."],
      ["aws ec2 describe-security-groups --group-ids <sg-lab>"],
      (c, cmd, ok) => ok && ehCmd(cmd, "ec2", "describe-security-groups") && (cmd.flags["group-ids"] !== undefined)),
  ]);
  at("diag-6", [
    d("fx-diag-rt2", "diagnostico", 3, 80, "A rota nova entrou mesmo?",
      "Antes de testar de novo, confirme que a rota <b>0.0.0.0/0</b> apareceu na tabela da sub-rede.",
      ["Mesmo `describe-route-tables`, só com a tabela do laboratório.", "A flag é `--route-table-ids`."],
      ["aws ec2 describe-route-tables --route-table-ids <rtb-id>"],
      (c, cmd, ok) => ok && ehCmd(cmd, "ec2", "describe-route-tables") && (cmd.flags["route-table-ids"] !== undefined)),
  ]);
  at("diag-10", [
    d("fx-diag-na2", "diagnostico", 3, 80, "A regra 40 saiu?",
      "Confira a ACL do laboratório e veja que a regra 40 sumiu — agora vale a 100.",
      ["Mesmo `describe-network-acls`, só a ACL do laboratório.", "A flag é `--network-acl-ids`."],
      ["aws ec2 describe-network-acls --network-acl-ids <acl-id>"],
      (c, cmd, ok) => ok && ehCmd(cmd, "ec2", "describe-network-acls") && (cmd.flags["network-acl-ids"] !== undefined)),
  ]);
  at("cob-vpc-4", [
    d("fx-diag-na3", "diagnostico", 3, 100, "O servidor virou disparador de spam",
      "Alguém usou o servidor pra mandar spam pela porta <b>25</b>. Crie uma regra de <b>saída</b> número <b>95</b> que nega a porta 25 pra qualquer destino.",
      ["Mesmo `create-network-acl-entry`, agora de saída.", "Troque `--ingress` por `--egress`."],
      ["aws ec2 create-network-acl-entry --network-acl-id <acl-id> --rule-number 95 --protocol tcp --port-range From=25,To=25 --cidr-block 0.0.0.0/0 --rule-action deny --egress"],
      (c, cmd, ok) => ok && ehCmd(cmd, "ec2", "create-network-acl-entry") && cmd.flags.egress !== undefined),
    d("fx-diag-nd2", "diagnostico", 3, 90, "O telnet foi desinstalado",
      "O telnet saiu do servidor e a regra 90 virou ruído — regra que ninguém entende é regra que ninguém tem coragem de mexer. Remova a regra <b>90</b> de entrada.",
      ["Mesmo `delete-network-acl-entry` do conserto #2."],
      ["aws ec2 delete-network-acl-entry --network-acl-id <acl-id> --ingress --rule-number 90"],
      (c, cmd, ok) => ok && ehCmd(cmd, "ec2", "delete-network-acl-entry") && String(cmd.flags["rule-number"] || "") === "90"),
  ]);
  at("cob-vpc-7", [
    d("fx-diag-fld2", "diagnostico", 3, 80, "Investigação encerrada",
      "O chamado foi fechado. Pare também a gravação que sobrou — flow log cobra pelo volume, mesmo quando ninguém lê.",
      ["Mesmo `delete-flow-logs`, com o id que sobrou no `describe-flow-logs`."],
      ["aws ec2 delete-flow-logs --flow-log-ids <flowlog-id>"],
      (c, cmd, ok) => ok && ehCmd(cmd, "ec2", "delete-flow-logs") && !flowLogs(c).length),
  ]);
})();
