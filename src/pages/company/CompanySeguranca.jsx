import {
  ShieldCheck, Lock, Server, BarChart3, FileCheck2, Eye, Database,
  Cloud, KeyRound, Trash2, MapPin, Sparkles, Headset, Check, X,
  AlertTriangle, Activity,
} from 'lucide-react'
import './CompanySeguranca.css'

export default function CompanySeguranca() {
  return (
    <div className="seg-root">
      {/* HERO */}
      <header className="seg-hero">
        <div className="seg-hero-bg" />
        <div className="seg-hero-inner">
          <div className="seg-eyebrow">
            <ShieldCheck size={13} />
            Segurança & privacidade
          </div>
          <h1 className="seg-title">
            Sua clínica é sua. <em>Seus pacientes, idem.</em>
          </h1>
          <p className="seg-sub">
            A gente cuida da plataforma — você cuida da sua gente. Aqui está,
            sem rodeio, exatamente o que fazemos com os dados que passam por aqui
            e o que você pode esperar de nós.
          </p>

          <div className="seg-trust-row">
            <div className="seg-trust-item">
              <Cloud size={13} /> AWS São Paulo
            </div>
            <span className="seg-trust-sep" />
            <div className="seg-trust-item">
              <KeyRound size={13} /> AES-256 at-rest
            </div>
            <span className="seg-trust-sep" />
            <div className="seg-trust-item">
              <Lock size={13} /> TLS 1.3 em trânsito
            </div>
            <span className="seg-trust-sep" />
            <div className="seg-trust-item">
              <FileCheck2 size={13} /> LGPD compliant
            </div>
          </div>
        </div>
      </header>

      {/* PILARES */}
      <section className="seg-section">
        <div className="seg-pillar-grid">
          <PillarCard
            icon={Lock}
            color="#C9A074"
            title="A conversa do seu paciente é da sua clínica"
            body={<>
              Ninguém da Nexla abre o chat de um paciente por curiosidade ou pra
              uso comercial. Em <strong>nenhuma hipótese</strong> usamos seus
              dados pra treinar IA externa, vender insight ou benchmark sem
              anonimizar.
            </>}
            note="Acesso técnico existe pra suporte (você pediu, equipe olhou) e auditoria de bugs — sempre registrado."
          />

          <PillarCard
            icon={Server}
            color="#2563EB"
            title="Infraestrutura AWS no Brasil"
            body={<>
              Servidores na <strong>AWS São Paulo</strong> com replicação
              geográfica e backups diários automáticos. Latência baixa, soberania
              de dados nacional, sem precisar lidar com dúvida sobre transferência
              internacional.
            </>}
            note="Banco de dados gerenciado, alta disponibilidade, monitoramento 24/7 de incidentes."
          />

          <PillarCard
            icon={KeyRound}
            color="#16A34A"
            title="Criptografia ponta a ponta"
            body={<>
              <strong>TLS 1.3</strong> protege cada mensagem entre o navegador e
              o servidor. <strong>AES-256 at-rest</strong> criptografa o banco
              inteiro — mesmo se alguém invadisse fisicamente o storage, os dados
              ficariam ilegíveis sem a chave.
            </>}
            note="Senhas com hash bcrypt + salt. Tokens de API individuais por empresa."
          />

          <PillarCard
            icon={BarChart3}
            color="#7C3AED"
            title="Métricas pra te ajudar — não pra bisbilhotar"
            body={<>
              A equipe Nexla acompanha <strong>números</strong>, não conteúdo:
              tempo de resposta médio, taxa de no-show, volume de mensagens. Isso
              vira recomendação concreta pra sua operação melhorar — não relatório
              de cotação pra terceiros.
            </>}
            note="Quando precisamos olhar um caso real, é via suporte, com sua autorização e registro em auditoria."
          />

          <PillarCard
            icon={FileCheck2}
            color="#DB2777"
            title="LGPD na prática, não no slide"
            body={<>
              Contrato com <strong>cláusula de tratamento de dados</strong>,
              DPO designado pela Nexla, política de retenção configurável por
              clínica. Cumprimos os direitos do paciente — acesso, retificação e
              exclusão — em prazos legais.
            </>}
            note="Você pode solicitar exportação ou exclusão de qualquer paciente em 2 cliques na ficha dele."
          />

          <PillarCard
            icon={Database}
            color="#0891B2"
            title="Você é o controlador, a Nexla é operadora"
            body={<>
              Os dados dos pacientes <strong>são da sua clínica</strong>. A Nexla
              processa em nome de vocês, conforme contrato. Se quiser sair da
              plataforma, faz a exportação completa em CSV/JSON — leva embora
              tudo que é seu.
            </>}
            note="Migração assistida sem custo. Você não fica refém da plataforma — é seu direito."
          />
        </div>
      </section>

      {/* O QUE VEMOS / NÃO VEMOS */}
      <section className="seg-section">
        <div className="seg-compare">
          <div className="seg-compare-head">
            <h2 className="seg-h2">Transparência total</h2>
            <p className="seg-h2-sub">
              <em>Sem zona cinza.</em> Aqui está exatamente o que a equipe Nexla
              acessa no dia-a-dia e o que <strong>nunca</strong> chega aos olhos
              dela sem autorização.
            </p>
          </div>

          <div className="seg-compare-grid">
            <div className="seg-compare-col seg-yes">
              <div className="seg-col-head">
                <Check size={16} /> O que a Nexla acompanha
              </div>
              <ul>
                <li><strong>Métricas agregadas</strong> — volume, tempo, conversão (números, não nomes)</li>
                <li><strong>Status de tickets</strong> — abertos, fechados, expirados (sem ler conteúdo)</li>
                <li><strong>Performance técnica</strong> — uptime, latência, erros de sistema</li>
                <li><strong>Logs anônimos</strong> — pra debugar problemas e melhorar a plataforma</li>
                <li><strong>Uso de features</strong> — quais telas vocês mais usam (pra priorizar evolução)</li>
              </ul>
              <div className="seg-col-foot">
                <Activity size={11} />
                Acompanhamento contínuo, sempre agregado.
              </div>
            </div>

            <div className="seg-compare-col seg-no">
              <div className="seg-col-head">
                <X size={16} /> O que a Nexla NÃO acessa rotineiramente
              </div>
              <ul>
                <li><strong>Conteúdo das mensagens</strong> entre paciente e clínica</li>
                <li><strong>Áudios, fotos, prontuários</strong> e dados clínicos</li>
                <li><strong>Histórico de saúde</strong> da ficha do paciente</li>
                <li><strong>Receita financeira</strong> nominal — só agregado</li>
                <li><strong>Senhas dos seus operadores</strong> (são guardadas com hash, ninguém vê)</li>
              </ul>
              <div className="seg-col-foot">
                <Headset size={11} />
                Acesso a conteúdo só com sua autorização explícita via suporte — fica registrado.
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* DIREITOS DO PACIENTE */}
      <section className="seg-section">
        <div className="seg-rights">
          <div className="seg-rights-head">
            <Sparkles size={14} className="seg-rights-ico" />
            <h2 className="seg-h2">Direitos do paciente — você atende em 2 cliques</h2>
            <p className="seg-h2-sub">
              <em>A LGPD não é burocracia, é reputação.</em> A plataforma já tem
              tudo embarcado pra você responder qualquer pedido em segundos.
            </p>
          </div>
          <div className="seg-rights-grid">
            <div className="seg-right-item">
              <div className="seg-right-num">01</div>
              <div className="seg-right-title">Acesso aos próprios dados</div>
              <p>Paciente pediu o que vocês têm sobre ele? Abre a ficha, exporta um PDF — pronto.</p>
            </div>
            <div className="seg-right-item">
              <div className="seg-right-num">02</div>
              <div className="seg-right-title">Retificação</div>
              <p>Erro no cadastro? Edita direto na ficha. Histórico de alterações fica registrado pra auditoria.</p>
            </div>
            <div className="seg-right-item">
              <div className="seg-right-num">03</div>
              <div className="seg-right-title">Exclusão / esquecimento</div>
              <p>Paciente quer ser apagado? Botão na ficha exclui o cadastro. Mensagens são anonimizadas em 30 dias.</p>
            </div>
            <div className="seg-right-item">
              <div className="seg-right-num">04</div>
              <div className="seg-right-title">Portabilidade</div>
              <p>Vai migrar de plataforma? Exporta tudo em CSV / JSON. Sem fee, sem retenção do dado.</p>
            </div>
          </div>
        </div>
      </section>

      {/* INCIDENTES */}
      <section className="seg-section">
        <div className="seg-incident">
          <div className="seg-incident-ico"><AlertTriangle size={20} /></div>
          <div className="seg-incident-body">
            <div className="seg-incident-title">E se acontecer algum incidente?</div>
            <p>
              Compromisso firmado em contrato: identificou? <strong>Em até 24h
              vocês são avisados</strong>, com explicação clara do que aconteceu,
              quais dados foram afetados (se houver) e o que está sendo feito pra
              resolver. ANPD notificada conforme prazo legal. Sem maquiar, sem
              esconder.
            </p>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="seg-section">
        <div className="seg-cta">
          <div className="seg-cta-mark">
            <ShieldCheck size={28} />
          </div>
          <div>
            <div className="seg-cta-title">Tem dúvida específica? Pergunta.</div>
            <p>
              Privacidade não é tema pra fica nas entrelinhas. Abra um chamado pelo
              suporte com a sua dúvida — DPO responde direto.
            </p>
          </div>
          <a href="#" className="seg-cta-btn" onClick={(e) => {
            e.preventDefault()
            // Abre o widget de suporte (FAB) — disparar click programático
            const fab = document.querySelector('.sw-fab')
            if (fab) fab.click()
          }}>
            <Headset size={15} /> Falar com a equipe
          </a>
        </div>
      </section>
    </div>
  )
}

function PillarCard({ icon: Icon, color, title, body, note }) {
  return (
    <div className="seg-pillar">
      <div className="seg-pillar-ico" style={{ background: `${color}18`, color }}>
        <Icon size={20} />
      </div>
      <h3 className="seg-pillar-title">{title}</h3>
      <p className="seg-pillar-body">{body}</p>
      {note && <p className="seg-pillar-note">{note}</p>}
    </div>
  )
}
