import { db } from './db.ts';

export function seedActivityTypesIfEmpty(): void {
  const existingTypes = db.prepare(`SELECT COUNT(*) as cnt FROM activity_types`).get() as {
    cnt: number;
  };
  if (existingTypes.cnt === 0) {
    const ins = db.prepare(`
      INSERT OR IGNORE INTO activity_types (name, category, description, default_shift, active)
      VALUES (?, ?, ?, ?, 1)
    `);
    ins.run('Reforço Escolar', 'Educacional', 'Aulas de alfabetização, matemática e acompanhamento pedagógico.', 'Manhã');
    ins.run('Acompanhamento Psicológico', 'Saúde e Psicologia', 'Atendimento psicológico infantil, ludoterapia e orientação familiar.', 'Integral');
    ins.run('Atendimento Médico / Pediatria', 'Saúde e Psicologia', 'Triagem pediátrica, clínica geral e encaminhamentos de saúde.', 'Manhã');
    ins.run('Projeto Esportivo', 'Esporte e Cidadania', 'Oficinas de futebol social, capoeira, atletismo e convivência.', 'Tarde');
    ins.run('Oficina de Artes e Leitura Viva', 'Cultura e Leitura', 'Mediação de leitura, artes visuais e expressão cultural.', 'Tarde');
    ins.run('Assistência e Orientação Familiar', 'Assistência Social', 'Atendimento socioassistencial, benefícios e apoio às famílias.', 'Integral');
  }

  // Ensure existing attendance_classes without activity_type_id get linked cleanly
  const reforco = db.prepare(`SELECT id FROM activity_types WHERE name = 'Reforço Escolar'`).get() as { id: number } | undefined;
  const esporte = db.prepare(`SELECT id FROM activity_types WHERE name = 'Projeto Esportivo'`).get() as { id: number } | undefined;
  if (reforco) {
    db.prepare(`UPDATE attendance_classes SET activity_type_id = ? WHERE activity_type_id IS NULL AND lower(name) LIKE '%refor%'`).run(reforco.id);
  }
  if (esporte) {
    db.prepare(`UPDATE attendance_classes SET activity_type_id = ? WHERE activity_type_id IS NULL AND (lower(name) LIKE '%futebol%' OR lower(name) LIKE '%esport%')`).run(esporte.id);
  }
}

export function seedDatabaseIfEmpty(): void {
  seedActivityTypesIfEmpty();

  const existingProjects = db.prepare(`SELECT COUNT(*) as cnt FROM projects`).get() as {
    cnt: number;
  };
  if (existingProjects.cnt > 0) return;

  db.exec('BEGIN');
  try {
    // 1. Projects
    const insertProject = db.prepare(`
      INSERT INTO projects (name, description, objective, target_audience, manager_name, start_date, end_date, planned_budget, target_beneficiaries, impact_indicator_label, impact_indicator_value, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const p1 = insertProject.run(
      'Reforço Escolar Caminho do Saber',
      'Aulas diárias de alfabetização, matemática, leitura orientada e acompanhamento pedagógico no contraturno escolar.',
      'Reduzir a defasagem escolar e fortalecer a permanência dos alunos na rede pública.',
      'Crianças e adolescentes de 6 a 14 anos',
      'Camila Rodrigues',
      '2026-02-01',
      '2026-12-20',
      145000,
      90,
      'Aprovação escolar esperada',
      '94% dos atendidos',
      'Ativo'
    ).lastInsertRowid;

    const p2 = insertProject.run(
      'Clínica Cuidar — Psicologia e Saúde',
      'Atendimento psicológico infantil, triagem pediátrica, fonoaudiologia e encaminhamentos médicos especializados.',
      'Promover saúde emocional e acesso integral a cuidados clínicos para crianças e responsáveis.',
      'Crianças, adolescentes e cuidadores',
      'Dra. Beatriz Alencar',
      '2026-01-15',
      '2026-12-30',
      180000,
      110,
      'Adesão terapêutica',
      '89% em acompanhamento contínuo',
      'Ativo'
    ).lastInsertRowid;

    const p3 = insertProject.run(
      'Esporte & Cidadania',
      'Oficinas de futebol social, capoeira, atletismo e convivência cidadã com lanche nutritivo.',
      'Desenvolver disciplina, cooperação, saúde física e prevenção de riscos sociais.',
      'Crianças e jovens de 7 a 16 anos',
      'Marcos Vinícius Souza',
      '2026-03-01',
      '2026-12-15',
      98000,
      75,
      'Frequência média nas oficinas',
      '86% de presença mensal',
      'Ativo'
    ).lastInsertRowid;

    const p4 = insertProject.run(
      'Apoio Integral às Famílias',
      'Atendimento socioassistencial, cestas básicas, orientação de benefícios e oficinas de geração de renda.',
      'Fortalecer a autonomia financeira e a segurança alimentar das famílias acompanhadas.',
      'Famílias em vulnerabilidade social',
      'Fernanda Costa Lima',
      '2026-01-10',
      '2026-12-31',
      125000,
      65,
      'Famílias com segurança alimentar',
      '58 núcleos assistidos',
      'Ativo'
    ).lastInsertRowid;

    const p5 = insertProject.run(
      'Oficina de Artes e Leitura Viva',
      'Mediação de leitura, artes visuais e expressão cultural para estímulo cognitivo infantil.',
      'Ampliar repertório cultural e habilidades socioemocionais.',
      'Crianças de 6 a 11 anos',
      'Camila Rodrigues',
      '2026-04-01',
      '2026-11-30',
      54000,
      45,
      'Livros lidos por trimestre',
      '4,2 livros por aluno',
      'Ativo'
    ).lastInsertRowid;

    // 2. Families
    const insertFamily = db.prepare(`
      INSERT INTO families (responsible_name, responsible_phone, responsible_cpf, address, neighborhood, household_size, working_members, family_income, vulnerability_level, vulnerability_notes, assistance_history)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const f1 = insertFamily.run(
      'Maria José da Silva',
      '(11) 98421-3301',
      '312.445.890-11',
      'Rua das Acácias, 142',
      'Jardim Esperança',
      5,
      1,
      1650,
      'Alta',
      'Mãe solo em trabalho informal; necessidade de reforço alimentar e contraturno.',
      'Recebe cesta básica mensal desde Março/2026 e encaminhamento ao CRAS.'
    ).lastInsertRowid;

    const f2 = insertFamily.run(
      'Carlos Eduardo Ferreira',
      '(11) 97210-8842',
      '425.118.230-44',
      'Travessa Boa Vista, 58',
      'Vila Nova',
      4,
      1,
      1980,
      'Moderada',
      'Pai trabalha em turno noturno; filhos precisam de acompanhamento pedagógico.',
      'Participa do grupo de orientação familiar trimestral.'
    ).lastInsertRowid;

    const f3 = insertFamily.run(
      'Antônia Lima dos Santos',
      '(11) 99104-5519',
      '289.774.610-08',
      'Av. Central, 890 - Casa 2',
      'Parque São Lucas',
      6,
      1,
      1420,
      'Extrema',
      'Avó cuidadora de três netos; demanda prioritária de saúde e assistência.',
      'Apoio emergencial alimentar + auxílio transporte para consultas.'
    ).lastInsertRowid;

    const f4 = insertFamily.run(
      'Juliana Aparecida Mendes',
      '(11) 96338-1190',
      '390.512.740-22',
      'Rua Projetada B, 27',
      'Jardim Horizonte',
      3,
      1,
      2100,
      'Moderada',
      'Dificuldade de adaptação escolar pós-mudança de bairro.',
      'Inserida no programa de apoio pedagógico e psicológico em Maio/2026.'
    ).lastInsertRowid;

    const f5 = insertFamily.run(
      'Roberto Alves Nascimento',
      '(11) 95512-9074',
      '501.883.120-77',
      'Rua Ipê Roxo, 310',
      'Jardim Esperança',
      4,
      2,
      2450,
      'Baixa',
      'Família em transição de renda, mantendo crianças nas oficinas esportivas.',
      'Acompanhamento semestral preventivo.'
    ).lastInsertRowid;

    // 3. Students / Beneficiaries
    const insertStudent = db.prepare(`
      INSERT INTO students (
        family_id, full_name, birth_date, cpf, rg, address, school_name, school_year, school_shift,
        guardian_name, guardian_phone, family_composition, household_size, family_income, working_members,
        vulnerability_situation, identified_needs, assistance_history, social_notes, programs_json, status, entry_date
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const s1 = insertStudent.run(
      f1, 'Lucas Silva Oliveira', '2016-11-14', '512.334.910-01', '54.219.880-1',
      'Rua das Acácias, 142 - Jardim Esperança', 'E.M. Paulo Freire', '4º Ano', 'Manhã',
      'Maria José da Silva', '(11) 98421-3301', 'Mãe e 3 irmãos', 5, 1650, 1,
      'Vulnerabilidade econômica alta e déficit de leitura',
      'Reforço em alfabetização, apoio emocional e lanche escolar',
      'Ingressou em 02/2026; recebeu kit escolar completo.',
      'Criança comunicativa, demonstra grande interesse por leitura quando acompanhada.',
      JSON.stringify(['Reforço Escolar', 'Acompanhamento Psicológico', 'Projeto Esportivo']),
      'ativo', '2026-02-10'
    ).lastInsertRowid;

    const s2 = insertStudent.run(
      f1, 'Mariana Silva Oliveira', '2018-04-22', '512.334.910-02', '58.110.234-9',
      'Rua das Acácias, 142 - Jardim Esperança', 'E.M. Paulo Freire', '2º Ano', 'Manhã',
      'Maria José da Silva', '(11) 98421-3301', 'Mãe e 3 irmãos', 5, 1650, 1,
      'Vulnerabilidade econômica alta',
      'Alfabetização inicial e acompanhamento pediátrico de rotina',
      'Kit escolar entregue em 02/2026.',
      'Boa adaptação às oficinas lúdicas.',
      JSON.stringify(['Reforço Escolar', 'Atendimento Médico']),
      'ativo', '2026-02-10'
    ).lastInsertRowid;

    const s3 = insertStudent.run(
      f2, 'Gabriel Ferreira Costa', '2014-11-28', '619.220.450-15', '51.908.332-4',
      'Travessa Boa Vista, 58 - Vila Nova', 'E.E. Monteiro Lobato', '6º Ano', 'Tarde',
      'Carlos Eduardo Ferreira', '(11) 97210-8842', 'Pai, mãe e 1 irmã', 4, 1980, 1,
      'Dificuldade em matemática e ansiedade escolar',
      'Reforço de matemática e atendimento psicológico quinzenal',
      'Avaliação diagnóstica realizada em 03/2026.',
      'Excelente desempenho no futebol social; ganhando confiança em sala.',
      JSON.stringify(['Reforço Escolar', 'Acompanhamento Psicológico', 'Projeto Esportivo']),
      'ativo', '2026-03-04'
    ).lastInsertRowid;

    const s4 = insertStudent.run(
      f3, 'Ana Beatriz Santos', '2015-07-09', '704.118.920-33', '53.442.109-2',
      'Av. Central, 890 - Parque São Lucas', 'E.M. Cora Coralina', '5º Ano', 'Manhã',
      'Antônia Lima dos Santos', '(11) 99104-5519', 'Avó e 2 irmãos', 6, 1420, 1,
      'Extrema vulnerabilidade socioeconômica',
      'Suporte nutricional, fonoaudiologia e reforço escolar integral',
      'Família recebe cesta básica e vale-transporte mensal.',
      'Muito dedicada às artes plásticas.',
      JSON.stringify(['Reforço Escolar', 'Atendimento Médico', 'Oficina de Artes e Leitura Viva']),
      'ativo', '2026-01-22'
    ).lastInsertRowid;

    const s5 = insertStudent.run(
      f3, 'Pedro Henrique Santos', '2012-09-18', '704.118.920-44', '49.882.441-7',
      'Av. Central, 890 - Parque São Lucas', 'E.E. Rui Barbosa', '8º Ano', 'Manhã',
      'Antônia Lima dos Santos', '(11) 99104-5519', 'Avó e 2 irmãos', 6, 1420, 1,
      'Risco de evasão escolar e necessidade de orientação vocacional',
      'Esporte, mentoria juvenil e acompanhamento psicológico',
      'Acompanhamento intensivo desde Janeiro/2026.',
      'Liderança positiva entre os colegas da categoria Sub-15.',
      JSON.stringify(['Projeto Esportivo', 'Acompanhamento Psicológico']),
      'ativo', '2026-01-22'
    ).lastInsertRowid;

    const s6 = insertStudent.run(
      f4, 'Sofia Mendes Rocha', '2017-11-05', '815.993.210-60', '56.712.900-3',
      'Rua Projetada B, 27 - Jardim Horizonte', 'E.M. Paulo Freire', '3º Ano', 'Tarde',
      'Juliana Aparecida Mendes', '(11) 96338-1190', 'Mãe e avô materno', 3, 2100, 1,
      'Adaptação escolar e timidez acentuada',
      'Oficina de leitura e acompanhamento psicológico',
      'Ingresso em Maio/2026.',
      'Evolução expressiva na socialização nos últimos dois meses.',
      JSON.stringify(['Reforço Escolar', 'Acompanhamento Psicológico', 'Oficina de Artes e Leitura Viva']),
      'ativo', '2026-05-12'
    ).lastInsertRowid;

    const s7 = insertStudent.run(
      f5, 'Matheus Alves Nascimento', '2013-02-19', '922.410.330-88', '50.119.874-0',
      'Rua Ipê Roxo, 310 - Jardim Esperança', 'E.E. Monteiro Lobato', '7º Ano', 'Manhã',
      'Roberto Alves Nascimento', '(11) 95512-9074', 'Pai, mãe e 1 irmão', 4, 2450, 2,
      'Baixa vulnerabilidade; busca desenvolvimento esportivo',
      'Projeto esportivo e oficina de leitura',
      'Participa regularmente desde Março/2026.',
      'Ótima assiduidade e espírito esportivo.',
      JSON.stringify(['Projeto Esportivo']),
      'ativo', '2026-03-18'
    ).lastInsertRowid;

    const s8 = insertStudent.run(
      f2, 'Helena Ferreira Costa', '2019-08-30', '619.220.450-99', null,
      'Travessa Boa Vista, 58 - Vila Nova', 'EMEI Pequeno Príncipe', '1º Ano', 'Manhã',
      'Carlos Eduardo Ferreira', '(11) 97210-8842', 'Pai, mãe e 1 irmão', 4, 1980, 1,
      'Aguardando abertura de turma de alfabetização tarde',
      'Vaga para reforço escolar e triagem pediátrica',
      'Pré-cadastro realizado em Outubro/2026.',
      'Prioridade na próxima abertura de vagas.',
      JSON.stringify(['Reforço Escolar']),
      'aguardando_vaga', '2026-10-15'
    ).lastInsertRowid;

    // Link students to projects
    const linkSP = db.prepare(`INSERT OR IGNORE INTO student_projects (student_id, project_id) VALUES (?, ?)`);
    linkSP.run(s1, p1); linkSP.run(s1, p2); linkSP.run(s1, p3);
    linkSP.run(s2, p1); linkSP.run(s2, p2);
    linkSP.run(s3, p1); linkSP.run(s3, p2); linkSP.run(s3, p3);
    linkSP.run(s4, p1); linkSP.run(s4, p2); linkSP.run(s4, p5);
    linkSP.run(s5, p3); linkSP.run(s5, p2);
    linkSP.run(s6, p1); linkSP.run(s6, p2); linkSP.run(s6, p5);
    linkSP.run(s7, p3);

    // Student evolutions
    const insertEvo = db.prepare(`
      INSERT INTO student_evolutions (student_id, author_name, category, note, recorded_at)
      VALUES (?, ?, ?, ?, ?)
    `);
    insertEvo.run(s1, 'Camila Rodrigues', 'Pedagógico', 'Avançou do nível silábico para alfabético na leitura de textos curtos.', '2026-11-10');
    insertEvo.run(s3, 'Marcos Vinícius Souza', 'Esportivo', 'Assumiu papel de capitão no torneio amistoso interbairros, com ótima postura.', '2026-11-12');
    insertEvo.run(s4, 'Fernanda Costa Lima', 'Social', 'Família recebeu encaminhamento positivo para tarifa social e acompanhamento nutricional.', '2026-11-05');

    // 4. Patients (linked to students without duplicating data + 1 community patient)
    const insertPatient = db.prepare(`
      INSERT INTO patients (student_id, full_name, birth_date, cpf, guardian_name, contact_phone, responsible_professional, specialty, follow_up_status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const pat1 = insertPatient.run(
      s1, 'Lucas Silva Oliveira', '2016-11-14', '512.334.910-01', 'Maria José da Silva', '(11) 98421-3301',
      'Dra. Beatriz Alencar', 'Psicologia', 'Em acompanhamento'
    ).lastInsertRowid;

    const pat2 = insertPatient.run(
      s3, 'Gabriel Ferreira Costa', '2014-11-28', '619.220.450-15', 'Carlos Eduardo Ferreira', '(11) 97210-8842',
      'Dra. Beatriz Alencar', 'Psicologia', 'Em acompanhamento'
    ).lastInsertRowid;

    const pat3 = insertPatient.run(
      s4, 'Ana Beatriz Santos', '2015-07-09', '704.118.920-33', 'Antônia Lima dos Santos', '(11) 99104-5519',
      'Dr. Henrique Vasconcelos', 'Pediatria', 'Em acompanhamento'
    ).lastInsertRowid;

    const pat4 = insertPatient.run(
      s6, 'Sofia Mendes Rocha', '2017-11-05', '815.993.210-60', 'Juliana Aparecida Mendes', '(11) 96338-1190',
      'Dra. Beatriz Alencar', 'Psicologia', 'Em acompanhamento'
    ).lastInsertRowid;

    const pat5 = insertPatient.run(
      null, 'Davi Lucas Pereira', '2020-06-11', '890.112.540-12', 'Cláudia Pereira', '(11) 97740-1288',
      'Dr. Henrique Vasconcelos', 'Pediatria', 'Aguardando triagem'
    ).lastInsertRowid;

    // 5. Appointments
    const insertApp = db.prepare(`
      INSERT INTO appointments (patient_id, professional_name, specialty, scheduled_date, scheduled_time, status, is_return, referral_to, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertApp.run(pat1, 'Dra. Beatriz Alencar', 'Psicologia', '2026-11-04', '09:00', 'Realizada', 1, '', 'Sessão de ludoterapia com ótima resposta.');
    insertApp.run(pat1, 'Dra. Beatriz Alencar', 'Psicologia', '2026-11-18', '09:00', 'Realizada', 1, '', 'Evolução positiva no foco e relacionamento.');
    insertApp.run(pat1, 'Dra. Beatriz Alencar', 'Psicologia', '2026-11-25', '09:00', 'Agendada', 1, '', 'Retorno quinzenal programado.');
    insertApp.run(pat2, 'Dra. Beatriz Alencar', 'Psicologia', '2026-11-11', '14:00', 'Realizada', 0, '', 'Sessão inicial de acolhimento.');
    insertApp.run(pat2, 'Dra. Beatriz Alencar', 'Psicologia', '2026-11-26', '14:00', 'Retorno Agendado', 1, '', 'Trabalhar ansiedade em provas escolares.');
    insertApp.run(pat3, 'Dr. Henrique Vasconcelos', 'Pediatria', '2026-11-06', '10:30', 'Realizada', 0, 'Fonoaudiologia UBS Vila Nova', 'Avaliação clínica geral e encaminhamento fonoaudiológico.');
    insertApp.run(pat3, 'Dr. Henrique Vasconcelos', 'Pediatria', '2026-11-27', '10:30', 'Agendada', 1, '', 'Reavaliação nutricional.');
    insertApp.run(pat4, 'Dra. Beatriz Alencar', 'Psicologia', '2026-11-12', '15:30', 'Falta', 1, '', 'Responsável informou chuva forte e impossibilidade de transporte.');
    insertApp.run(pat4, 'Dra. Beatriz Alencar', 'Psicologia', '2026-11-24', '15:30', 'Agendada', 1, '', 'Reagendamento após falta justificada.');
    insertApp.run(pat5, 'Dr. Henrique Vasconcelos', 'Pediatria', '2026-11-28', '11:00', 'Agendada', 0, '', 'Triagem inicial de saúde infantil.');

    // Historical appointments for charts across months
    const historicalMonths = ['2026-06', '2026-07', '2026-08', '2026-09', '2026-10'];
    const psyCounts = [14, 18, 21, 24, 26];
    const medCounts = [8, 10, 12, 13, 15];
    historicalMonths.forEach((ym, idx) => {
      for (let i = 0; i < Math.min(psyCounts[idx], 4); i++) {
        insertApp.run(pat1, 'Dra. Beatriz Alencar', 'Psicologia', `${ym}-1${i + 1}`, '09:00', 'Realizada', 1, '', 'Acompanhamento mensal regular.');
      }
      for (let i = 0; i < Math.min(medCounts[idx], 3); i++) {
        insertApp.run(pat3, 'Dr. Henrique Vasconcelos', 'Pediatria', `${ym}-2${i + 1}`, '10:30', 'Realizada', 0, '', 'Consulta pediátrica preventiva.');
      }
    });

    // 6. Suppliers
    const insertSupplier = db.prepare(`
      INSERT INTO suppliers (legal_name, trade_name, document, commercial_contact, phone, email, address, category, bank_details, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const sup1 = insertSupplier.run(
      'Distribuidora Alimentos Bom Sabor Ltda', 'Bom Sabor Alimentos', '12.345.678/0001-90',
      'Ricardo Nogueira', '(11) 3341-9020', 'vendas@bomsabor.com.br',
      'Av. Industrial, 450 - São Paulo/SP', 'Alimentação',
      'Banco do Brasil (001) · Ag 1240-8 · CC 44910-2 · PIX CNPJ 12.345.678/0001-90', 'ativo'
    ).lastInsertRowid;

    const sup2 = insertSupplier.run(
      'Papelaria & Didáticos Horizonte ME', 'Horizonte Escolar', '23.987.654/0001-12',
      'Patrícia Moura', '(11) 3882-1450', 'contato@horizonteescolar.com.br',
      'Rua Líbero Badaró, 210 - São Paulo/SP', 'Materiais escolares',
      'Itaú (341) · Ag 0412 · CC 88120-5', 'ativo'
    ).lastInsertRowid;

    const sup3 = insertSupplier.run(
      'Clínica & Consultoria Saúde Integral S/S', 'Saúde Integral', '34.555.111/0001-08',
      'Dr. Renato Campos', '(11) 3214-7700', 'financeiro@saudeintegral.org.br',
      'Alameda Santos, 1100 - São Paulo/SP', 'Profissionais e serviços',
      'Santander (033) · Ag 2210 · CC 13004921-1', 'ativo'
    ).lastInsertRowid;

    const sup4 = insertSupplier.run(
      'EsporteTotal Artigos Esportivos Ltda', 'EsporteTotal', '45.102.333/0001-55',
      'Fábio Teixeira', '(11) 3665-2280', 'pedidos@esportetotal.com.br',
      'Rua da Consolação, 980 - São Paulo/SP', 'Materiais esportivos',
      'Bradesco (237) · Ag 0891 · CC 55219-8', 'ativo'
    ).lastInsertRowid;

    // 7. Donors
    const insertDonor = db.prepare(`
      INSERT INTO donors (name, document, phone, email, address, donor_type, frequency, status, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const don1 = insertDonor.run(
      'Fundação Horizonte Solidário', '08.771.220/0001-33', '(11) 3090-1122',
      'parcerias@fundacaohorizonte.org.br', 'Av. Paulista, 1842 - São Paulo/SP',
      'Institucional', 'Mensal', 'ativo', 'Mantenedor principal dos projetos de reforço e saúde.'
    ).lastInsertRowid;

    const don2 = insertDonor.run(
      'TechBrasil Soluções S.A.', '19.440.882/0001-71', '(11) 4004-8820',
      'esg@techbrasil.com.br', 'Av. Faria Lima, 3200 - São Paulo/SP',
      'Empresa', 'Mensal', 'ativo', 'Patrocínio corporativo via programa de impacto educacional.'
    ).lastInsertRowid;

    const don3 = insertDonor.run(
      'Marcelo Augusto Ribeiro', '214.889.330-55', '(11) 99812-4401',
      'marcelo.ribeiro@email.com', 'Rua Oscar Freire, 620 - São Paulo/SP',
      'Pessoa Física', 'Mensal', 'ativo', 'Doador recorrente desde 2025.'
    ).lastInsertRowid;

    const don4 = insertDonor.run(
      'Edital Criança Futuro 2026', '00.394.460/0001-41', '(11) 3111-5000',
      'editais@criancafuturo.gov.br', 'Praça da Sé, 100 - São Paulo/SP',
      'Edital / Fundo', 'Trimestral', 'ativo', 'Recurso vinculado ao projeto Clínica Cuidar.'
    ).lastInsertRowid;

    const don5 = insertDonor.run(
      'Helena Cristina Duarte', '178.554.210-19', '(11) 98123-7745',
      'helena.duarte@email.com', 'Rua Augusta, 1520 - São Paulo/SP',
      'Pessoa Física', 'Única', 'inativo', 'Contribuição pontual no bazar beneficente anterior.'
    ).lastInsertRowid;

    // 8. Financial transactions + history
    const insertTx = db.prepare(`
      INSERT INTO financial_transactions (
        type, description, category, amount, status, issue_date, due_date, settlement_date,
        payment_method, recurrence, cost_center, project_id, supplier_id, donor_id, receipt_ref, notes, created_by
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertFinHist = db.prepare(`
      INSERT INTO financial_history (transaction_id, changed_by, change_type, previous_json, new_json)
      VALUES (?, ?, ?, ?, ?)
    `);

    const seedTx = (
      type: 'receita' | 'despesa',
      desc: string,
      cat: string,
      amount: number,
      status: string,
      issue: string,
      due: string,
      settle: string | null,
      method: string,
      rec: string,
      cc: string,
      pid: number | bigint | null,
      sid: number | bigint | null,
      did: number | bigint | null,
      ref: string,
      notes: string
    ) => {
      const id = insertTx.run(
        type, desc, cat, amount, status, issue, due, settle, method, rec, cc, pid, sid, did, ref, notes, 'Sistema'
      ).lastInsertRowid;
      insertFinHist.run(id, 'Sistema (Carga Inicial)', 'Criação', null, JSON.stringify({ desc, amount, status }));
    };

    // Revenues across Jun-Nov 2026
    seedTx('receita', 'Repasse Mensal Fundação Horizonte - Junho', 'Patrocínios', 18500, 'Recebido', '2026-06-05', '2026-06-05', '2026-06-05', 'Transferência Bancária', 'Mensal', 'Educação', p1, null, don1, 'REC-2026-061', 'Parcela mensal projeto Reforço Escolar');
    seedTx('receita', 'Repasse Mensal Fundação Horizonte - Julho', 'Patrocínios', 18500, 'Recebido', '2026-07-05', '2026-07-05', '2026-07-05', 'Transferência Bancária', 'Mensal', 'Educação', p1, null, don1, 'REC-2026-071', 'Parcela mensal');
    seedTx('receita', 'Aporte TechBrasil Soluções - Agosto', 'Contribuições de empresas', 14000, 'Recebido', '2026-08-10', '2026-08-10', '2026-08-10', 'PIX', 'Mensal', 'Esporte', p3, null, don2, 'REC-2026-084', 'Apoio Esporte & Cidadania');
    seedTx('receita', 'Edital Criança Futuro - Parcela 2', 'Editais e projetos', 28000, 'Recebido', '2026-09-12', '2026-09-12', '2026-09-12', 'TED', 'Trimestral', 'Saúde', p2, null, don4, 'REC-2026-092', 'Parcela trimestral Clínica Cuidar');
    seedTx('receita', 'Repasse Mensal Fundação Horizonte - Outubro', 'Patrocínios', 18500, 'Recebido', '2026-10-05', '2026-10-05', '2026-10-05', 'Transferência Bancária', 'Mensal', 'Educação', p1, null, don1, 'REC-2026-101', 'Parcela mensal');
    seedTx('receita', 'Aporte TechBrasil Soluções - Outubro', 'Contribuições de empresas', 14000, 'Recebido', '2026-10-10', '2026-10-10', '2026-10-10', 'PIX', 'Mensal', 'Esporte', p3, null, don2, 'REC-2026-105', 'Apoio mensal');
    seedTx('receita', 'Bazar e Jantar Solidário Instituto SER', 'Eventos beneficentes', 9800, 'Recebido', '2026-10-22', '2026-10-22', '2026-10-22', 'Cartão / PIX', 'Única', 'Assistência Social', p4, null, null, 'REC-2026-109', 'Arrecadação evento comunitário');
    seedTx('receita', 'Repasse Mensal Fundação Horizonte - Novembro', 'Patrocínios', 18500, 'Recebido', '2026-11-05', '2026-11-05', '2026-11-05', 'Transferência Bancária', 'Mensal', 'Educação', p1, null, don1, 'REC-2026-111', 'Parcela mensal Novembro');
    seedTx('receita', 'Aporte TechBrasil Soluções - Novembro', 'Contribuições de empresas', 14000, 'Recebido', '2026-11-10', '2026-11-10', '2026-11-10', 'PIX', 'Mensal', 'Esporte', p3, null, don2, 'REC-2026-112', 'Apoio mensal Novembro');
    seedTx('receita', 'Doação Recorrente Marcelo Ribeiro', 'Doações recorrentes', 1200, 'Recebido', '2026-11-15', '2026-11-15', '2026-11-15', 'PIX', 'Mensal', 'Assistência Social', p4, null, don3, 'REC-2026-113', 'Doação mensal recorrente');
    seedTx('receita', 'Edital Criança Futuro - Parcela 3 (Prevista)', 'Editais e projetos', 22000, 'Pendente', '2026-11-18', '2026-11-29', null, 'TED', 'Trimestral', 'Saúde', p2, null, don4, 'PREV-2026-119', 'Aguardando liberação bancária');

    // Expenses across Jun-Nov 2026
    seedTx('despesa', 'Lanches e Cestas Básicas - Junho', 'Alimentação', 7200, 'Pago', '2026-06-10', '2026-06-15', '2026-06-14', 'Boleto', 'Mensal', 'Assistência Social', p4, sup1, null, 'NF-8801', 'Fornecimento mensal');
    seedTx('despesa', 'Kits Escolares e Cadernos - Julho', 'Materiais escolares', 4850, 'Pago', '2026-07-08', '2026-07-18', '2026-07-17', 'Transferência', 'Única', 'Educação', p1, sup2, null, 'NF-2044', 'Reposição semestral');
    seedTx('despesa', 'Serviços Técnicos Psicologia e Pediatria - Ago', 'Saúde', 9600, 'Pago', '2026-08-05', '2026-08-20', '2026-08-19', 'TED', 'Mensal', 'Saúde', p2, sup3, null, 'NF-5112', 'Equipe clínica conveniada');
    seedTx('despesa', 'Uniformes e Bolas Esporte & Cidadania - Set', 'Materiais esportivos', 5400, 'Pago', '2026-09-04', '2026-09-15', '2026-09-14', 'PIX', 'Única', 'Esporte', p3, sup4, null, 'NF-3390', 'Compra de equipamentos esportivos');
    seedTx('despesa', 'Lanches e Cestas Básicas - Outubro', 'Alimentação', 8100, 'Pago', '2026-10-08', '2026-10-15', '2026-10-15', 'Boleto', 'Mensal', 'Assistência Social', p4, sup1, null, 'NF-9102', 'Fornecimento Outubro');
    seedTx('despesa', 'Serviços Técnicos Psicologia e Pediatria - Out', 'Saúde', 9800, 'Pago', '2026-10-05', '2026-10-20', '2026-10-20', 'TED', 'Mensal', 'Saúde', p2, sup3, null, 'NF-5290', 'Atendimentos Outubro');
    seedTx('despesa', 'Manutenção Predial e Energia - Outubro', 'Infraestrutura', 3450, 'Pago', '2026-10-12', '2026-10-25', '2026-10-24', 'Débito Automático', 'Mensal', 'Administrativo', null, null, null, 'CTA-1044', 'Despesa sede Instituto SER');
    seedTx('despesa', 'Lanches e Cestas Básicas - Novembro', 'Alimentação', 8450, 'Pago', '2026-11-05', '2026-11-15', '2026-11-14', 'Boleto', 'Mensal', 'Assistência Social', p4, sup1, null, 'NF-9410', 'Fornecimento Novembro');
    seedTx('despesa', 'Serviços Técnicos Psicologia e Pediatria - Nov', 'Saúde', 9800, 'Pendente', '2026-11-05', '2026-11-25', null, 'TED', 'Mensal', 'Saúde', p2, sup3, null, 'NF-5418', 'Vencimento próximo');
    seedTx('despesa', 'Material Didático Oficina de Leitura', 'Materiais escolares', 2350, 'Vencido', '2026-11-02', '2026-11-18', null, 'Boleto', 'Única', 'Educação', p5, sup2, null, 'NF-2219', 'Aguardando conferência da nota');
    seedTx('despesa', 'Vale-Transporte Famílias Atendidas', 'Transporte', 1650, 'Pago', '2026-11-03', '2026-11-10', '2026-11-10', 'PIX', 'Mensal', 'Assistência Social', p4, null, null, 'REC-VT-11', 'Deslocamento para consultas médicas');
    seedTx('despesa', 'Contabilidade e Gestão Administrativa', 'Despesas administrativas', 2900, 'Pendente', '2026-11-10', '2026-11-28', null, 'Boleto', 'Mensal', 'Administrativo', null, null, null, 'BOL-1128', 'Honorários mensais');

    // 9. Volunteers & Hours
    const insertVolunteer = db.prepare(`
      INSERT INTO volunteers (full_name, cpf, phone, email, area, education, availability, schedule_hours, project_id, entry_date, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertHour = db.prepare(`
      INSERT INTO volunteer_hours (volunteer_id, project_id, activity_date, hours, activity_description)
      VALUES (?, ?, ?, ?, ?)
    `);

    const v1 = insertVolunteer.run(
      'Camila Rodrigues Martins', '145.678.901-22', '(11) 98845-1102', 'camila.rodrigues@institutoser.org.br',
      'Pedagogia e Reforço Escolar', 'Licenciatura em Pedagogia', 'Segundas, Quartas e Sextas', '08h30 às 12h00',
      p1, '2025-08-15', 'ativo'
    ).lastInsertRowid;

    const v2 = insertVolunteer.run(
      'Marcos Vinícius Souza', '256.789.012-33', '(11) 97620-3349', 'marcos.esporte@institutoser.org.br',
      'Educação Física e Esportes', 'Bacharelado em Educação Física', 'Terças e Quintas', '14h00 às 17h30',
      p3, '2026-02-01', 'ativo'
    ).lastInsertRowid;

    const v3 = insertVolunteer.run(
      'Dra. Beatriz Alencar', '367.890.123-44', '(11) 99123-8800', 'beatriz.psi@institutoser.org.br',
      'Psicologia Infantil', 'Mestrado em Psicologia do Desenvolvimento', 'Quartas e Sextas', '09h00 às 16h00',
      p2, '2026-01-12', 'ativo'
    ).lastInsertRowid;

    const v4 = insertVolunteer.run(
      'Lucas Mendes Prado', '478.901.234-55', '(11) 96441-2290', 'lucas.prado@email.com',
      'Oficina de Leitura e Artes', 'Graduando em Letras', 'Sábados', '09h00 às 13h00',
      p5, '2026-11-01', 'ativo'
    ).lastInsertRowid;

    insertHour.run(v1, p1, '2026-11-04', 4, 'Reforço de alfabetização e leitura guiada Turma Manhã');
    insertHour.run(v1, p1, '2026-11-11', 4, 'Acompanhamento individual de matemática básica');
    insertHour.run(v1, p1, '2026-11-18', 3.5, 'Avaliação bimestral de leitura dos alunos');
    insertHour.run(v2, p3, '2026-11-05', 3.5, 'Treino técnico de futebol e roda de convivência');
    insertHour.run(v2, p3, '2026-11-12', 4, 'Torneio amistoso comunitário');
    insertHour.run(v3, p2, '2026-11-06', 6, 'Atendimentos psicológicos e devolutiva às famílias');
    insertHour.run(v3, p2, '2026-11-13', 6, 'Atendimentos individuais e estudo de caso multidisciplinar');
    insertHour.run(v4, p5, '2026-11-14', 4, 'Mediação de leitura e oficina de desenho');

    // 10. Attendance Classes, Enrollments & Records
    const insertClass = db.prepare(`
      INSERT INTO attendance_classes (name, project_id, instructor_name, schedule_label, shift)
      VALUES (?, ?, ?, ?, ?)
    `);
    const c1 = insertClass.run('Reforço Escolar Manhã — Alfabetização', p1, 'Camila Rodrigues', 'Seg / Qua / Sex · 09h00', 'Manhã').lastInsertRowid;
    const c2 = insertClass.run('Reforço Escolar Tarde — Matemática e Leitura', p1, 'Camila Rodrigues', 'Ter / Qui · 14h30', 'Tarde').lastInsertRowid;
    const c3 = insertClass.run('Futebol Social e Convivência', p3, 'Marcos Vinícius Souza', 'Ter / Qui · 15h30', 'Tarde').lastInsertRowid;

    const enroll = db.prepare(`INSERT OR IGNORE INTO class_enrollments (class_id, student_id) VALUES (?, ?)`);
    enroll.run(c1, s1); enroll.run(c1, s2); enroll.run(c1, s4);
    enroll.run(c2, s3); enroll.run(c2, s6);
    enroll.run(c3, s1); enroll.run(c3, s3); enroll.run(c3, s5); enroll.run(c3, s7);

    const insertAtt = db.prepare(`
      INSERT INTO attendance_records (class_id, student_id, date, status, justification, recorded_by)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const attDates = ['2026-11-04', '2026-11-06', '2026-11-11', '2026-11-13', '2026-11-18', '2026-11-20'];
    attDates.forEach((dt, idx) => {
      insertAtt.run(c1, s1, dt, 'presente', '', 'Camila Rodrigues');
      insertAtt.run(c1, s2, dt, idx === 3 ? 'justificada' : 'presente', idx === 3 ? 'Consulta pediátrica' : '', 'Camila Rodrigues');
      insertAtt.run(c1, s4, dt, idx >= 4 ? 'falta' : 'presente', '', 'Camila Rodrigues');
    });
    ['2026-11-05', '2026-11-12', '2026-11-19'].forEach((dt) => {
      insertAtt.run(c2, s3, dt, 'presente', '', 'Camila Rodrigues');
      insertAtt.run(c2, s6, dt, 'presente', '', 'Camila Rodrigues');
      insertAtt.run(c3, s1, dt, 'presente', '', 'Marcos Vinícius Souza');
      insertAtt.run(c3, s3, dt, 'presente', '', 'Marcos Vinícius Souza');
      insertAtt.run(c3, s5, dt, 'presente', '', 'Marcos Vinícius Souza');
      insertAtt.run(c3, s7, dt, 'presente', '', 'Marcos Vinícius Souza');
    });

    // 11. Documents (leaving s6 & s7 without consent term so "Alertas de documentos pendentes" shows real actionable alerts!)
    const insertDoc = db.prepare(`
      INSERT INTO documents (title, category, person_type, person_id, person_name, project_id, access_level, file_name, file_mime, file_size, uploaded_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insertDoc.run('Termo de Consentimento LGPD — Lucas Silva', 'Termo de Consentimento LGPD', 'aluno', s1, 'Lucas Silva Oliveira', p1, 'geral', 'termo_lgpd_lucas.pdf', 'application/pdf', 248120, 'Fernanda Costa Lima');
    insertDoc.run('Autorização de Uso de Imagem — Mariana Silva', 'Autorização de Responsável', 'aluno', s2, 'Mariana Silva Oliveira', p1, 'geral', 'autorizacao_mariana.pdf', 'application/pdf', 184320, 'Fernanda Costa Lima');
    insertDoc.run('Termo de Consentimento LGPD — Gabriel Ferreira', 'Termo de Consentimento LGPD', 'aluno', s3, 'Gabriel Ferreira Costa', p1, 'geral', 'termo_lgpd_gabriel.pdf', 'application/pdf', 219400, 'Fernanda Costa Lima');
    insertDoc.run('Termo de Consentimento LGPD — Ana Beatriz', 'Termo de Consentimento LGPD', 'aluno', s4, 'Ana Beatriz Santos', p2, 'geral', 'termo_lgpd_ana.pdf', 'application/pdf', 231000, 'Fernanda Costa Lima');
    insertDoc.run('Termo de Consentimento LGPD — Pedro Henrique', 'Termo de Consentimento LGPD', 'aluno', s5, 'Pedro Henrique Santos', p3, 'geral', 'termo_lgpd_pedro.pdf', 'application/pdf', 210500, 'Fernanda Costa Lima');
    insertDoc.run('Nota Fiscal #9410 — Bom Sabor Alimentos', 'Nota Fiscal', 'fornecedor', sup1, 'Bom Sabor Alimentos', p4, 'restrito_financeiro', 'nf_9410_bomsabor.pdf', 'application/pdf', 312040, 'Diretoria Financeira');
    insertDoc.run('Contrato Convênio Clínica Saúde Integral', 'Contrato', 'fornecedor', sup3, 'Saúde Integral', p2, 'restrito_diretoria', 'contrato_saude_integral_2026.pdf', 'application/pdf', 892100, 'Diretoria Executiva');
    insertDoc.run('Relatório Anual de Impacto Social 2025', 'Relatório Institucional', 'geral', null, 'Instituto SER', null, 'geral', 'relatorio_impacto_2025.pdf', 'application/pdf', 1420500, 'Diretoria Executiva');

    // 12. Upcoming Institutional Events
    const insertEvent = db.prepare(`
      INSERT INTO events (title, event_date, event_time, location, project_id, description)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    insertEvent.run('Mostra Cultural e Feira de Leitura', '2026-11-28', '09:30', 'Sede Instituto SER — Pátio Central', p5, 'Apresentação dos trabalhos das oficinas e entrega de livros às famílias.');
    insertEvent.run('Roda de Conversa com Famílias — Saúde Emocional', '2026-12-03', '18:30', 'Auditório Comunitário', p2, 'Encontro conduzido pela Dra. Beatriz Alencar com responsáveis.');
    insertEvent.run('Festival Esportivo de Encerramento', '2026-12-12', '08:30', 'Quadra Poliesportiva Vila Nova', p3, 'Jogos integrativos e premiação de participação.');

    // 13. Audit log baseline
    db.prepare(`
      INSERT INTO audit_logs (user_name, user_role, action, entity_type, entity_id, details)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run('Sistema Instituto SER', 'admin', 'INIT', 'database', '1', 'Base relacional inicializada com estrutura integrada dos módulos.');

    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
