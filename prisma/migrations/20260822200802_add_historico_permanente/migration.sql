-- AlterTable
ALTER TABLE "Escala" ADD COLUMN     "finalizadoEm" TIMESTAMP(3),
ADD COLUMN     "importadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "importadoPor" TEXT;

-- AlterTable
ALTER TABLE "EscalaMembro" ADD COLUMN     "cargo" TEXT;

-- CreateTable
CREATE TABLE "ImportacaoLog" (
    "id" TEXT NOT NULL,
    "dataHora" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usuarioNome" TEXT,
    "lojaNome" TEXT NOT NULL,
    "dataOperacao" TIMESTAMP(3) NOT NULL,
    "horarioOperacao" TEXT,
    "totalProcessados" INTEGER NOT NULL DEFAULT 0,
    "totalNovos" INTEGER NOT NULL DEFAULT 0,
    "totalAtualizados" INTEGER NOT NULL DEFAULT 0,
    "erros" INTEGER NOT NULL DEFAULT 0,
    "detalhes" TEXT,
    "escalaId" TEXT,

    CONSTRAINT "ImportacaoLog_pkey" PRIMARY KEY ("id")
);
