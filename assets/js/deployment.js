export const deployment = Object.freeze({
  "backendAvailable": false,
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
        "id": "refreshment",
        "name": "Una pausa refrescante",
        "description": "Una bebida individual para refrescar tu día.",
        "category": "BEBIDAS",
        "image": "/premio/assets/images/refreshment.svg",
        "featured": true,
        "stock": 0
      },
      {
        "id": "snack",
        "name": "Un pequeño antojo",
        "description": "Un snack individual para ese momento de antojo.",
        "category": "SNACKS",
        "image": "/premio/assets/images/snack.svg",
        "featured": false,
        "stock": 0
      },
      {
        "id": "coffee",
        "name": "Un momento de calma",
        "description": "Un café individual para disfrutar sin apuro.",
        "category": "CAFÉ",
        "image": "/premio/assets/images/coffee.svg",
        "featured": false,
        "stock": 0
      }
    ]
  },
  "backendNotice": "GitHub Pages aloja esta web, pero todavía no tiene un servidor de premios conectado. No se registran participaciones ni se permiten canjes."
});
