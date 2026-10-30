export const deployment = Object.freeze({
  "backendAvailable": true,
  "apiBaseUrl": "https://br-polished-violet-b4dyd4nr-api.compute.c-6.us-east-2.aws.neon.tech",
  "bearerTransport": true,
  "adminRefreshMs": 15000,
  "staticCampaign": {
    "active": false,
    "availableStock": 0,
    "publicUrl": "https://pgallardob.github.io/premio",
    "promotionContact": "",
    "rules": {
      "interval": 20,
      "expiryDays": 5,
      "cooldownEnabled": true,
      "cooldownHours": 24,
      "dailyCodeEnabled": false
    },
    "prizes": [
      {
        "id": "opener",
        "name": "Destapador Monster",
        "description": "Un destapador Monster para tu colección.",
        "category": "ACCESORIOS",
        "image": "/premio/assets/images/opener.svg",
        "featured": true,
        "stock": 0
      },
      {
        "id": "cookies",
        "name": "Galletas mini Costa",
        "description": "Unas galletas mini Costa para disfrutar.",
        "category": "GALLETAS",
        "image": "/premio/assets/images/cookies.svg",
        "featured": false,
        "stock": 0
      },
      {
        "id": "jokey",
        "name": "Jokey",
        "description": "Un Jokey disponible para ti en el local.",
        "category": "ACCESORIOS",
        "image": "/premio/assets/images/jokey.svg",
        "featured": false,
        "stock": 0
      },
      {
        "id": "tshirt",
        "name": "Polera",
        "description": "Una polera para sumar a tus favoritos.",
        "category": "VESTUARIO",
        "image": "/premio/assets/images/tshirt.svg",
        "featured": false,
        "stock": 0
      },
      {
        "id": "planner",
        "name": "Agenda",
        "description": "Una agenda para tus próximas ideas.",
        "category": "PAPELERÍA",
        "image": "/premio/assets/images/planner.svg",
        "featured": false,
        "stock": 0
      }
    ]
  },
  "backendNotice": "GitHub Pages aloja esta web, pero todavía no tiene un servidor de premios conectado. No se registran participaciones ni se permiten canjes."
});
