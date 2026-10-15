import type { ClinicalField, ClinicalPage, ClinicalRow } from "./anamnese";

const f = (id: string, label: string, type: ClinicalField["type"] = "text", options?: string[]): ClinicalField => ({ id, label, type, options });
const yn = (id: string, label: string) => f(id, label, "choice", ["Sim", "Não"]);
const pair = (left: string, ...right: string[]): ClinicalRow => ({ left: [left], right });
const conditions = [
  ["medicalTreatment", "Faz algum tratamento médico", "Qual tratamento médico"], ["previousSurgery", "Cirurgia plástica ou cirurgia anterior", "Qual cirurgia"],
  ["orthomolecular", "Já fez algum tratamento ortomolecular", "Qual tratamento ortomolecular"], ["oncology", "Antecedentes oncológicos", "Quais antecedentes oncológicos"],
  ["orthopedic", "Possui problema ortopédico", "Qual problema ortopédico"], ["acids", "Usa ou já usou ácidos na pele", "Quais ácidos"],
  ["pacemaker", "Portador de marcapasso", "Qual marcapasso"], ["metals", "Presença de metais", "Local dos metais"], ["endocrine", "Tem algum problema endocrinológico", "Qual problema endocrinológico"],
  ["varicose", "Varizes", "Grau das varizes"], ["lesions", "Lesões", "Local das lesões"],
  ["ulcer", "Úlcera / gastrite", "Observações sobre úlcera / gastrite"], ["liver", "Problemas de fígado", "Observações sobre fígado"],
  ["heart", "Problemas de coração", "Observações sobre coração"], ["hepatitis", "Hepatite", "Observações sobre hepatite"], ["hiv", "HIV", "Observações sobre HIV"],
  ["previousAesthetic", "Já fez tratamento estético anteriormente", "Qual tratamento estético"]
] as const;
const familyConditions = [["hypertension", "Hipertensão"], ["hypotension", "Hipotensão"], ["epilepsy", "Epilepsia"], ["diabetes", "Diabetes"]] as const;
const conditionFields = (items: typeof conditions | (typeof conditions)[number][]) => items.flatMap(([id, label, detail]) => [yn(id, label), f(id + "Details", detail)]);
const conditionRows = (items: typeof conditions | (typeof conditions)[number][]) => items.map(([id]) => pair(id, id + "Details"));
export const bodyMeasurementRegions = ["Busto", "Braço esquerdo", "Braço direito", "Abdômen superior", "Abdômen inferior", "Quadril", "Culote", "Coxa esquerda", "Coxa direita", "Panturrilha esquerda", "Panturrilha direita"];
export const bodyMeasurementPhases = ["Inicial", "Meio", "Última"];
// Retain saved answers from older fichas while removing these fields from the form and PDF.
export const retiredBodyFields: ClinicalField[] = [f("companyName", "Nome da empresa"), f("companyAddress", "Endereço da empresa"), f("companyCnpj", "CNPJ da empresa"), f("professionalSignature", "Assinatura do esteticista", "signature"), ...Array.from({length: 12}, (_, i) => f(`sessionAcknowledgment${i}`, `Visto do paciente - ${i + 1}ª sessão`))];
export function bodyConsentText() {
  return "Estou ciente e de acordo com todas as informações acima relacionadas. AUTORIZO o uso de minha imagem e/ou voz e/ou depoimento e/ou dados biográficos em todo e qualquer material entre fotos, documentos e outros meios de comunicação, para ser utilizada em campanhas promocionais e institucional da AVVI Clínica, sejam essas destinadas à divulgação ao público em geral e/ou apenas para uso interno desta instituição, desde que não haja desvirtuamento da sua finalidade. A presente autorização é concedida a título gratuito, abrangendo o uso da imagem acima mencionada em todo território nacional e no exterior, em todas as suas modalidades e sem limite de tempo ou número de utilizações.";
}
export const bodyClinicalPages: ClinicalPage[] = [
  { title: "Dados e hábitos", sections: [
    { title: "Dados pessoais", fields: [f("name", "Nome completo"), f("sex", "Sexo", "choice", ["Feminino", "Masculino"]), f("rg", "RG"), f("cpf", "CPF"), f("birthDate", "Data de nascimento", "date"), f("age", "Idade", "number"), f("maritalStatus", "Estado civil"), f("email", "E-mail"), f("phone", "Telefone"), f("cellphone", "Celular"), f("address", "Endereço"), f("district", "Bairro"), f("city", "Cidade"), f("state", "Estado"), f("zip", "CEP")] },
    { title: "Em caso de emergência avisar", fields: [f("emergencyName", "Nome do contato de emergência"), f("emergencyPhone", "Telefone de emergência"), f("emergencyRelationship", "Grau de parentesco")] },
    { title: "Histórico do paciente", fields: [f("treatmentReason", "Motivo do tratamento"), f("allergyTypes", "Alergias (anestésicos, medicamentos ou cosméticos)"), f("creams", "Cremes em uso (face e corpo)"), f("medications", "Medicamentos em uso (via oral)")] },
    { title: "Hábitos", fields: [yn("exercise", "Pratica atividade física"), f("exerciseType", "Qual atividade física"), f("exerciseFrequency", "Frequência da atividade física"), yn("smoking", "Fuma"), f("alcohol", "Ingere bebidas alcoólicas", "choice", ["Muito", "Moderado", "Não consumo"]), f("urine", "Urina", "choice", ["Normal", "Pouco", "Muito"]), f("sun", "Exposição ao sol", "choice", ["Às vezes", "Pouco", "Diariamente"]), f("appetite", "Apetite", "choice", ["Muito", "Moderado", "Pouco"]), f("water", "Consumo de água", "choice", ["Abundante", "Moderado", "Não consumo"]), f("sleep", "Qualidade do sono", "choice", ["Normal", "Moderado", "Pouco"]), f("sleepHours", "Quantas horas de sono", "number")], rows: [pair("exercise", "exerciseType", "exerciseFrequency"), pair("smoking"), pair("alcohol"), pair("urine"), pair("sun"), pair("appetite"), pair("water"), pair("sleep", "sleepHours")] },
    { title: "Exclusivo para pacientes do sexo feminino", fields: [yn("menstrualCycle", "Ciclo menstrual regular"), yn("pregnant", "Está grávida ou pretende engravidar"), yn("polycysticOvary", "Ovário policístico"), yn("children", "Filhos"), f("childrenCount", "Quantidade de filhos", "choice", ["1 filho", "2 filhos", "3 ou mais filhos"]), yn("contraceptive", "Usa método anticoncepcional"), f("contraceptiveWhich", "Qual método anticoncepcional")], rows: [pair("menstrualCycle"), pair("pregnant"), pair("polycysticOvary"), {left: ["children", "childrenCount"]}, pair("contraceptive", "contraceptiveWhich")] }
  ] },
  { title: "Antecedentes e declaração", sections: [
    { title: "Antecedentes pessoais", fields: [...conditionFields(conditions.slice(0, 11)), ...familyConditions.flatMap(([id, label]) => [yn(id, label), yn(id + "Family", `${label}: caso na família`), f(id + "FamilyWho", `${label}: quem na família`)]), ...conditionFields(conditions.slice(11)), f("historyNotes", "Observações dos antecedentes", "area")], rows: [...conditionRows(conditions.slice(0, 11)), ...familyConditions.map(([id]) => ({left: [id, id + "Family"], right: [id + "FamilyWho"]})), ...conditionRows(conditions.slice(11)), {full: ["historyNotes"]}] },
    { title: "Termo de responsabilidade e autorização de uso de imagens", declaration: bodyConsentText(), fields: [f("patientSignature", "Assinatura do paciente", "signature")] }
  ] },
  { title: "Avaliação corporal", sections: [
    { title: "Protocolo e tratamento", image: "/anamnese/avaliacao-corporal.png", fields: [f("protocol", "Protocolo / tratamento escolhido"), f("appliedRegion", "Região aplicada"), f("treatmentValue", "Valor (R$)", "number"), f("sessionsCount", "Número de sessões", "number"), f("productsUsed", "Produtos utilizados"), f("equipmentUsed", "Equipamentos utilizados")] },
    { title: "Biometria", fields: [f("height", "Altura (m)", "number"), f("weight", "Peso (kg)", "number"), f("bmi", "IMC", "number")] },
    { title: "Características corporais", fields: [
      f("localizedFat", "Gordura localizada", "checks", ["Obesidade", "Visceral", "Localizada"]), f("fitzpatrick", "Fitzpatrick (cor da pele)", "choice", ["1", "2", "3", "4", "5"]),
      f("stretchMarks", "Estrias", "checks", ["Alba", "Rubra"]), f("stretchThickness", "Espessura das estrias"), f("stretchLength", "Comprimento das estrias"),
      f("dyschromia", "Discromias", "checks", ["Hipercromia", "Hipocromia", "Acromia"]), f("circulatory", "Alterações circulatórias", "checks", ["Varizes", "Microvarizes", "Telangiectasias"]),
      f("scars", "Cicatrizes inestéticas", "checks", ["Hipertróficas", "Atróficas", "Queloide"]), f("posture", "Desvio postural", "checks", ["Escoliose", "Hiperlordose", "Pés pronados", "Pés supinados"]),
      f("cellulite", "Celulite", "checks", ["Edematosa", "Túrgida", "Mista", "Flácida"]), f("celluliteRegion", "Região da celulite"), f("celluliteGrade", "Grau da celulite", "choice", ["Grau I", "Grau II", "Grau III", "Grau IV"]), f("celluliteGradeRegion", "Região avaliada para o grau"),
      f("bodyShape", "Forma corpórea", "choice", ["Androide", "Ginoide", "Mista"]), f("hypotonia", "Hipotonia", "checks", ["Muscular", "Tissular"]), f("hair", "Pêlos", "checks", ["Hipertricose", "Hirsutismo"]),
      f("surgeryType", "Tipo de cirurgia"), f("postoperativePeriod", "Período pós-operatório", "choice", ["Até 30 dias", "Entre 30 e 50 dias", "Mais de 50 dias"]), f("postoperativeChanges", "Alterações estéticas pós-operatórias", "checks", ["Equimose", "Edema", "Seroma", "Fibrose", "Queloide", "Cicatriz hipertrófica", "Hipercromia cicatricial"])
    ], rows: [pair("localizedFat"), pair("fitzpatrick"), pair("stretchMarks", "stretchThickness", "stretchLength"), pair("dyschromia"), pair("circulatory"), pair("scars"), pair("posture"), pair("cellulite", "celluliteRegion"), pair("celluliteGrade", "celluliteGradeRegion"), pair("bodyShape"), pair("hypotonia"), pair("hair"), pair("postoperativePeriod", "surgeryType"), pair("postoperativeChanges")] }
  ] },
  { title: "Medidas e acompanhamento", sections: bodyMeasurementPhases.map((phase, p) => ({ title: `${phase} - acompanhamento das sessões`, fields: [f(`photo${p}`, `Referência da foto - ${phase}`), ...bodyMeasurementRegions.map((region, i) => f(`measurement${p}_${i}`, `${region} (cm) - ${phase}`, "number"))] })).concat([{title: "Observações das medidas", fields: [f("measurementNotes", "Observações do acompanhamento", "area")]}]) },
  { title: "Sessões e relatório", sections: [...Array.from({length: 12}, (_, i) => ({ title: `${i + 1}ª sessão`, fields: [f(`sessionDate${i}`, `Data da ${i + 1}ª sessão`, "date")] })), { title: "Relatório", fields: [f("bodyReport", "Relatório do tratamento", "area")] }] }
];
