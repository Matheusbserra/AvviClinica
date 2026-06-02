import type { Procedure } from "./types";

const procedureCostByName: Record<string, number> = {
  "aplicacao de bcaa": 190.08,
  "bioestimulador de gluteo 2x elleva 210": 1964.08,
  "bioestimulador elleva 150": 766.07,
  "bioestimulador elleva 210": 1902.07,
  "bioestimulador radiesse": 905.84,
  "bioestimulador rennova diamond": 685.07,
  "bioestimulador sculptra": 1071.85,
  "botox dysport": 674.08,
  "botox lelyo inferior": 534.08,
  "botox letybo inferior": 534.08,
  "botox letybo superior": 520.08,
  "consulta": 133.08,
  "fios de pdo": 518.84,
  "fios de pdo de tracao 4 fios": 402.08,
  "fios de pdo fillers 2 canulas": 382.58,
  "lavien": 295.84,
  "lavieen": 295.84,
  "lavien 1 paciente": 475.08,
  "lavieen 1 paciente": 475.08,
  "lavien area menor 2pac": 325.08,
  "lavieen area menor 2pac": 325.08,
  "lavien face 2pac": 325.08,
  "lavieen face 2pac": 325.08,
  "microagulhamento com peeling": 235.08,
  "pdo espiculado fe type l canula 4 fios blister": 587.39,
  "pdo espiculado molda sc type l canula 4 fios blister": 901.39,
  "pdo espiculado moldado sc type l canula 4 fios blister": 901.39,
  "pdo multi liso l canula 4 fios blister": 569.58,
  "peeling lha la peel": 251.08,
  "preenchedor belotero intense": 430.84,
  "preenchedor biogelis volume": 408.08,
  "preenchedor contour": 376.53,
  "preenchedor contuor": 376.53,
  "preenchedor global": 410.08,
  "preenchedor lift lips plus lido": 474.07,
  "preenchedor rennova ultra volume": 420.84,
  "preenchedor rennova ultravolume": 420.84,
  "preenchedor restylane defyne": 556.70,
  "preenchedor restylane lift": 519.08,
  "preenchedor restylane tradicional": 411.08,
  "preenchedor yvoire volume": 362.84,
  "preenchimento gluteos": 440.84,
  "preenchimento gluteos combo 42ml": 3269.08,
  "protocolo redefyne": 197.08,
  "protocolo redefyne plus": 232.58,
  "ultraformer contorno inferior": 695.08,
  "ultraformer full face": 1435.08,
  "ultraformer olheira": 523.84,
  "ultraformer papada": 695.08,
  "ultraformer pescoco": 695.08
};

export function applyProcedureCostOverrides(procedures: Procedure[]) {
  return procedures.map((procedure) => {
    const cost = procedureCostByName[normalizeProcedureName(procedure.name)];
    return cost === undefined ? procedure : { ...procedure, averageCost: cost };
  });
}

function normalizeProcedureName(value: string) {
  return value
    .replace(/Ã§/g, "ç")
    .replace(/Ã£/g, "ã")
    .replace(/Ã¡/g, "á")
    .replace(/Ã©/g, "é")
    .replace(/Ãº/g, "ú")
    .replace(/Ã³/g, "ó")
    .replace(/Ãª/g, "ê")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
