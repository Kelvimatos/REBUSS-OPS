# REBUSS OPS — Central de Ferramentas

> **As ferramentas que você precisa para sua rotina em um só lugar.**  
> Desenvolvido por **Kelvi Matos**.

---

## 🎯 Sobre o REBUSS OPS

O **REBUSS OPS** reúne em um único site limpo, sóbrio, rápido e profissional as duas ferramentas operacionais essenciais da REBUSS:

1. **📋 Copiador de Nomes Inteligente**: Tratamento, filtros, limpeza de códigos/numerações, deduplicação, atalhos de teclado e cópia ágil para lançamentos.
2. **📅 Gerador de Escalas**: Preenchimento rápido, localização de transporte público via OpenStreetMap/Overpass API e geração de mensagens padronizadas para WhatsApp.

---

## 👤 Seleção de Usuário ao Entrar

Ao abrir o site, é exibida uma tela simples perguntando: **"Quem está acessando?"**

Perfis disponíveis:
* **Kelvi** (com foto real ampliada e identificação como Kelvi Matos)
* **Francisco** (avatar neutro)
* **Bruno** (avatar neutro)
* **Matheus** (avatar neutro)
* **Arthur** (avatar neutro)
* **Alexandre** (avatar neutro)

A escolha fica salva no `localStorage`. Para trocar de perfil a qualquer momento, basta clicar no botão **"Trocar"** no topo direito da página.

---

## 🧭 Estrutura de Navegação

* **Início**: Página inicial direta com os 2 cards para abrir cada ferramenta.
* **Copiador de Nomes**: Módulo completo do Copiador com todas as suas funções e atalhos.
* **Gerador de Escalas**: Módulo completo de Escalas com identificação de metrô/trem/terminais e histórico.

---

## ⌨️ Atalhos de Teclado

| Atalho | Ação |
| :--- | :--- |
| <kbd>Alt</kbd> + <kbd>C</kbd> ou <kbd>Espaço</kbd> | Copiar próximo nome pendente |
| <kbd>Ctrl</kbd> + <kbd>Enter</kbd> | Carregar lista de nomes no Copiador |
| <kbd>Ctrl</kbd> + <kbd>Z</kbd> | Desfazer última cópia (*Undo*) |
| <kbd>/</kbd> | Focar no campo de busca de nomes |
| <kbd>Alt</kbd> + <kbd>T</kbd> | Alternar tema Claro / Escuro |
| <kbd>Esc</kbd> | Fechar modais / Limpar busca |
| <kbd>?</kbd> | Abrir modal de atalhos |

---

## 📁 Estrutura de Arquivos

```text
REBUSS OPS/
│
├── index.html                  # Shell único da aplicação
├── README.md                   # Documentação do projeto
│
├── assets/
│   ├── logo.png                # Logotipo REBUSS
│   ├── favicon.png             # Favicon
│   └── kelvi-matos.jpg         # Foto do Kelvi Matos
│
├── css/
│   └── style.css               # Estilos sóbrios, limpos e responsivos (Design System)
│
└── js/
    ├── app.js                  # Controle de usuários, navegação, tema, som e atalhos
    ├── copiador.js             # Lógica completa do Copiador de Nomes
    └── escalas.js              # Lógica completa do Gerador de Escalas e APIs
```

---

## 💻 Como Executar

Abra o arquivo `index.html` em qualquer navegador moderno. Não requer instalação de dependências ou servidor complexo.
