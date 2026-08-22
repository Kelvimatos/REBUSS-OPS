-- CreateTable
CREATE TABLE "Usuario" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "matricula" TEXT,
    "telefone" TEXT,
    "cidade" TEXT,
    "estado" TEXT,
    "status" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Equipe" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "cidade" TEXT,
    "estado" TEXT,
    "status" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Equipe_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EquipeMembro" (
    "id" TEXT NOT NULL,
    "equipeId" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,

    CONSTRAINT "EquipeMembro_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Loja" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "endereco" TEXT,
    "cidade" TEXT,
    "estado" TEXT,
    "cep" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Loja_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Escala" (
    "id" TEXT NOT NULL,
    "lojaId" TEXT NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "horario" TEXT NOT NULL,
    "pivNecessario" INTEGER,
    "observacoes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ABERTA',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Escala_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EscalaMembro" (
    "id" TEXT NOT NULL,
    "escalaId" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDENTE',
    "confirmou" BOOLEAN NOT NULL DEFAULT false,
    "horarioConfirmacao" TIMESTAMP(3),
    "chegou" BOOLEAN NOT NULL DEFAULT false,
    "horarioChegada" TIMESTAMP(3),

    CONSTRAINT "EscalaMembro_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ocorrencia" (
    "id" TEXT NOT NULL,
    "escalaId" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "observacao" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Ocorrencia_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_matricula_key" ON "Usuario"("matricula");

-- CreateIndex
CREATE UNIQUE INDEX "EquipeMembro_equipeId_usuarioId_key" ON "EquipeMembro"("equipeId", "usuarioId");

-- CreateIndex
CREATE UNIQUE INDEX "EscalaMembro_escalaId_usuarioId_key" ON "EscalaMembro"("escalaId", "usuarioId");

-- AddForeignKey
ALTER TABLE "EquipeMembro" ADD CONSTRAINT "EquipeMembro_equipeId_fkey" FOREIGN KEY ("equipeId") REFERENCES "Equipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipeMembro" ADD CONSTRAINT "EquipeMembro_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Escala" ADD CONSTRAINT "Escala_lojaId_fkey" FOREIGN KEY ("lojaId") REFERENCES "Loja"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EscalaMembro" ADD CONSTRAINT "EscalaMembro_escalaId_fkey" FOREIGN KEY ("escalaId") REFERENCES "Escala"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EscalaMembro" ADD CONSTRAINT "EscalaMembro_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
