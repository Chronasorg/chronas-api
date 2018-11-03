const fetch = require('node-fetch')
const utils = require('../utils')

const properties = {
  chronasApiHost: 'http://localhost:4040/v1'
}

function getYear(dateString) {
  if (!dateString) return undefined
  return parseInt(dateString.substring(0, dateString.substr(1).indexOf("-") + 1))
}

const rulList = []
const alreadyProcessed=[]
let rulerObject = {}
let originalMeta

/*
check those:
  Q1772009 1200 Guiraut de Calanso undefined Q191085 Q142 BnF%20ms.%2012473%20fol.%20128%20-%20Guiraut%20de%20Calanson%20%281%29.jpg France FRA
!!!!!!!!! QID Q191085
!!!!!!!!! coo [ -0.176, 43.977 ]
!!!!!!!!! coo [ -0.176, 43.977 ]
marker success addedd
ae|ruler|FRA -linked- https://upload.wikimedia.org/wikipedia/commons/a/a6/BnF_ms._12473_fol._119v_-_Albertet_de_Sisteron_%282%29.jpg 200
[ 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9d/BnF_ms._12473_fol._128_-_Guiraut_de_Calanson_%281%29.jpg/400px-BnF_ms._12473_fol._128_-_Guiraut_de_Calanson_%281%29.jpg',
  'https://upload.wikimedia.org/wikipedia/commons/9/9d/BnF_ms._12473_fol._128_-_Guiraut_de_Calanson_%281%29.jpg' ]
{"_id":"https://upload.wikimedia.org/wikipedia/commons/9/9d/BnF_ms._12473_fol._128_-_Guiraut_de_Calanson_%281%29.jpg","data":{"title":"Guiraut de Calanso","poster":"https://upload.wikimedia.org/wikipedia/commons/thumb/9/9d/BnF_ms._12473_fol._128_-_Guiraut_de_Calanson_%281%29.jpg/400px-BnF_ms._12473_fol._128_-_Guiraut_de_Calanson_%281%29.jpg","year":1200},"wiki":"Guiraut_de_Calanso","year":1200,"subtype":"people","type":"i"} {"_id":"https://upload.wikimedia.org/wikipedia/commons/9/9d/BnF_ms._12473_fol._128_-_Guiraut_de_Calanson_%281%29.jpg","name":"Guiraut de Calanso","coo":[-0.176,43.977],"type":"p","year":1200}
ae|ruler|FRA -linked- Albertet_de_Sestaro 200
https://upload.wikimedia.org/wikipedia/commons/a/a6/BnF_ms._12473_fol._119v_-_Albertet_de_Sisteron_%282%29.jpg -linked- Albertet_de_Sestaro 200
  metadata added
OOOOOOO 404 MARKER, adding next   Guiraut_de_Calanso
{ linkedItemType1: 'metadata',
  linkedItemType2: 'metadata',
  linkedItemKey1: 'ae|ruler|FRA',
  linkedItemKey2: 'https://upload.wikimedia.org/wikipedia/commons/9/9d/BnF_ms._12473_fol._128_-_Guiraut_de_Calanson_%281%29.jpg',
  type1: 'e',
  type2: 'e' }
{ linkedItemType1: 'metadata',
  linkedItemType2: 'markers',
  linkedItemKey1: 'ae|ruler|FRA',
  linkedItemKey2: 'Guiraut_de_Calanso',
  type1: 'a',
  type2: 'a' }
{ linkedItemType1: 'metadata',
  linkedItemType2: 'markers',
  linkedItemKey1: 'https://upload.wikimedia.org/wikipedia/commons/9/9d/BnF_ms._12473_fol._128_-_Guiraut_de_Calanson_%281%29.jpg',
  linkedItemKey2: 'Guiraut_de_Calanso',
  type1: 'e',
  type2: 'e' }
next
Q1772046 1210 Simon de Beaulieu undefined Q4096403 Q142 Simon%20de%20Beaulieu.JPG France FRA
!!!!!!!!! QID Q4096403
!!!!!!!!! coo undefined
!!!!!!!!! coo undefined
  [ 'https://upload.wikimedia.org/wikipedia/commons/d/d1/Simon_de_Beaulieu.JPG',
  'https://upload.wikimedia.org/wikipedia/commons/d/d1/Simon_de_Beaulieu.JPG' ]
{"_id":"https://upload.wikimedia.org/wikipedia/commons/d/d1/Simon_de_Beaulieu.JPG","data":{"title":"Simon de Beaulieu","poster":"https://upload.wikimedia.org/wikipedia/commons/d/d1/Simon_de_Beaulieu.JPG","year":1210},"wiki":"Simon_de_Beaulieu","year":1210,"subtype":"people","type":"i"} {"_id":"https://upload.wikimedia.org/wikipedia/commons/d/d1/Simon_de_Beaulieu.JPG","name":"Simon de Beaulieu","type":"p","year":1210}
marker success addedd
ae|ruler|FRA -linked- Guiraut_de_Calanso 200
ae|ruler|FRA -linked- https://upload.wikimedia.org/wikipedia/commons/9/9d/BnF_ms._12473_fol._128_-_Guiraut_de_Calanson_%281%29.jpg 200
https://upload.wikimedia.org/wikipedia/commons/9/9d/BnF_ms._12473_fol._128_-_Guiraut_de_Calanson_%281%29.jpg -linked- Guiraut_de_Calanso 200
  metadata added
OOOOOOO 404 MARKER, adding next   Simon_de_Beaulieu
{ linkedItemType1: 'metadata',
  linkedItemType2: 'metadata',
  linkedItemKey1: 'ae|ruler|FRA',
  linkedItemKey2: 'https://upload.wikimedia.org/wikipedia/commons/d/d1/Simon_de_Beaulieu.JPG',
  type1: 'e',
  type2: 'e' }
{ linkedItemType1: 'metadata',
  linkedItemType2: 'markers',
  linkedItemKey1: 'ae|ruler|FRA',
  linkedItemKey2: 'Simon_de_Beaulieu',
  type1: 'a',
  type2: 'a' }
{ linkedItemType1: 'metadata',
  linkedItemType2: 'markers',
  linkedItemKey1: 'https://upload.wikimedia.org/wikipedia/commons/d/d1/Simon_de_Beaulieu.JPG',
  linkedItemKey2: 'Simon_de_Beaulieu',
  type1: 'e',
  type2: 'e' }
next
Q1772117 1300 Raymond de Canillac undefined Q142 Q142 Raymond%20de%20Canillac.jpg France FRA
!!!!!!!!! QID Q142
marker success addedd
!!!!!!!!! coo [ 2, 47 ]
!!!!!!!!! coo [ 2, 47 ]
  [ 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/af/Raymond_de_Canillac.jpg/400px-Raymond_de_Canillac.jpg',
  'https://upload.wikimedia.org/wikipedia/commons/a/af/Raymond_de_Canillac.jpg' ]
{"_id":"https://upload.wikimedia.org/wikipedia/commons/a/af/Raymond_de_Canillac.jpg","data":{"title":"Raymond de Canillac","poster":"https://upload.wikimedia.org/wikipedia/commons/thumb/a/af/Raymond_de_Canillac.jpg/400px-Raymond_de_Canillac.jpg","year":1300},"wiki":"Raymond_de_Canillac","year":1300,"subtype":"people","type":"i"} {"_id":"https://upload.wikimedia.org/wikipedia/commons/a/af/Raymond_de_Canillac.jpg","name":"Raymond de Canillac","coo":[2,47],"type":"p","year":1300}
ae|ruler|FRA -linked- https://upload.wikimedia.org/wikipedia/commons/d/d1/Simon_de_Beaulieu.JPG 200
ae|ruler|FRA -linked- Simon_de_Beaulieu 200
https://upload.wikimedia.org/wikipedia/commons/d/d1/Simon_de_Beaulieu.JPG -linked- Simon_de_Beaulieu 200
  metadata added
OOOOOOO 404 MARKER, adding next   Raymond_de_Canillac
{ linkedItemType1: 'metadata',
  linkedItemType2: 'metadata',
  linkedItemKey1: 'ae|ruler|FRA',
  linkedItemKey2: 'https://upload.wikimedia.org/wikipedia/commons/a/af/Raymond_de_Canillac.jpg',
  type1: 'e',
  type2: 'e' }
{ linkedItemType1: 'metadata',
  linkedItemType2: 'markers',
  linkedItemKey1: 'ae|ruler|FRA',
  linkedItemKey2: 'Raymond_de_Canillac',
  type1: 'a',
  type2: 'a' }
{ linkedItemType1: 'metadata',
  linkedItemType2: 'markers',
  linkedItemKey1: 'https://upload.wikimedia.org/wikipedia/commons/a/af/Raymond_de_Canillac.jpg',
  linkedItemKey2: 'Raymond_de_Canillac',
  type1: 'e',
  type2: 'e' }
next
Q1772208 1320 Bertrand Lagier undefined Q207614 Q142 Chiostro%20di%20ognissanti%2C%20personalit%C3%A0%20francescane%2025%20Bertrand%20Lagier.JPG France FRA
!!!!!!!!! QID Q207614
!!!!!!!!! coo [ 2.032, 44.609 ]
!!!!!!!!! coo [ 2.032, 44.609 ]
marker success addedd
ae|ruler|FRA -linked- https://upload.wikimedia.org/wikipedia/commons/a/af/Raymond_de_Canillac.jpg 200
[ 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3f/Chiostro_di_ognissanti%2C_personalit%C3%A0_francescane_25_Bertrand_Lagier.JPG/400px-Chiostro_di_ognissanti%2C_personalit%C3%A0_francescane_25_Bertrand_Lagier.JPG',
  'https://upload.wikimedia.org/wikipedia/commons/3/3f/Chiostro_di_ognissanti%2C_personalit%C3%A0_francescane_25_Bertrand_Lagier.JPG' ]
{"_id":"https://upload.wikimedia.org/wikipedia/commons/3/3f/Chiostro_di_ognissanti%2C_personalit%C3%A0_francescane_25_Bertrand_Lagier.JPG","data":{"title":"Bertrand Lagier","poster":"https://upload.wikimedia.org/wikipedia/commons/thumb/3/3f/Chiostro_di_ognissanti%2C_personalit%C3%A0_francescane_25_Bertrand_Lagier.JPG/400px-Chiostro_di_ognissanti%2C_personalit%C3%A0_francescane_25_Bertrand_Lagier.JPG","year":1320},"wiki":"Bertrand_Lagier","year":1320,"subtype":"people","type":"i"} {"_id":"https://upload.wikimedia.org/wikipedia/commons/3/3f/Chiostro_di_ognissanti%2C_personalit%C3%A0_francescane_25_Bertrand_Lagier.JPG","name":"Bertrand Lagier","coo":[2.032,44.609],"type":"p","year":1320}
https://upload.wikimedia.org/wikipedia/commons/a/af/Raymond_de_Canillac.jpg -linked- Raymond_de_Canillac 200
  ae|ruler|FRA -linked- Raymond_de_Canillac 200
metadata added
OOOOOOO 404 MARKER, adding next   Bertrand_Lagier
{ linkedItemType1: 'metadata',
  linkedItemType2: 'metadata',
  linkedItemKey1: 'ae|ruler|FRA',
  linkedItemKey2: 'https://upload.wikimedia.org/wikipedia/commons/3/3f/Chiostro_di_ognissanti%2C_personalit%C3%A0_francescane_25_Bertrand_Lagier.JPG',
  type1: 'e',
  type2: 'e' }
{ linkedItemType1: 'metadata',
  linkedItemType2: 'markers',
  linkedItemKey1: 'ae|ruler|FRA',
  linkedItemKey2: 'Bertrand_Lagier',
  type1: 'a',
  type2: 'a' }
{ linkedItemType1: 'metadata',
  linkedItemType2: 'markers',
  linkedItemKey1: 'https://upload.wikimedia.org/wikipedia/commons/3/3f/Chiostro_di_ognissanti%2C_personalit%C3%A0_francescane_25_Bertrand_Lagier.JPG',
  linkedItemKey2: 'Bertrand_Lagier',
  type1: 'e',
  type2: 'e' }
next
marker success addedd
Q1772296 1416 Pedro Ferris undefined Q29 Q29 Cardenal%20Pedro%20Ferriz.jpg Spain SPA
!!!!!!!!! QID Q29
!!!!!!!!! coo [ -3, 40 ]
!!!!!!!!! coo [ -3, 40 ]
  [ 'https://upload.wikimedia.org/wikipedia/commons/a/ac/Cardenal_Pedro_Ferriz.jpg',
  'https://upload.wikimedia.org/wikipedia/commons/a/ac/Cardenal_Pedro_Ferriz.jpg' ]
{"_id":"https://upload.wikimedia.org/wikipedia/commons/a/ac/Cardenal_Pedro_Ferriz.jpg","data":{"title":"Pedro Ferris","poster":"https://upload.wikimedia.org/wikipedia/commons/a/ac/Cardenal_Pedro_Ferriz.jpg","year":1416},"wiki":"Pedro_Ferris","year":1416,"subtype":"people","type":"i"} {"_id":"https://upload.wikimedia.org/wikipedia/commons/a/ac/Cardenal_Pedro_Ferriz.jpg","name":"Pedro Ferris","coo":[-3,40],"type":"p","year":1416}
ae|ruler|FRA -linked- https://upload.wikimedia.org/wikipedia/commons/3/3f/Chiostro_di_ognissanti%2C_personalit%C3%A0_francescane_25_Bertrand_Lagier.JPG 200
https://upload.wikimedia.org/wikipedia/commons/3/3f/Chiostro_di_ognissanti%2C_personalit%C3%A0_francescane_25_Bertrand_Lagier.JPG -linked- Bertrand_Lagier 200
  ae|ruler|FRA -linked- Bertrand_Lagier 200
metadata added
OOOOOOO 404 MARKER, adding next   Pedro_Ferris
{ linkedItemType1: 'metadata',
  linkedItemType2: 'metadata',
  linkedItemKey1: 'ae|ruler|SPA',
  linkedItemKey2: 'https://upload.wikimedia.org/wikipedia/commons/a/ac/Cardenal_Pedro_Ferriz.jpg',
  type1: 'e',
  type2: 'e' }
{ linkedItemType1: 'metadata',
  linkedItemType2: 'markers',
  linkedItemKey1: 'ae|ruler|SPA',
  linkedItemKey2: 'Pedro_Ferris',
  type1: 'a',
  type2: 'a' }
{ linkedItemType1: 'metadata',
  linkedItemType2: 'markers',
  linkedItemKey1: 'https://upload.wikimedia.org/wikipedia/commons/a/ac/Cardenal_Pedro_Ferriz.jpg',
  linkedItemKey2: 'Pedro_Ferris',
  type1: 'e',
  type2: 'e' }
next
Q1772311 1295 Fortanerius Vassalli undefined Q730146 Q142 Fontanier%20de%20Vassal.jpg France FRA
!!!!!!!!! QID Q730146
!!!!!!!!! coo [ 1.53, 44.674 ]
!!!!!!!!! coo [ 1.53, 44.674 ]
marker success addedd
  [ 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2e/Fontanier_de_Vassal.jpg/400px-Fontanier_de_Vassal.jpg',
  'https://upload.wikimedia.org/wikipedia/commons/2/2e/Fontanier_de_Vassal.jpg' ]
{"_id":"https://upload.wikimedia.org/wikipedia/commons/2/2e/Fontanier_de_Vassal.jpg","data":{"title":"Fortanerius Vassalli","poster":"https://upload.wikimedia.org/wikipedia/commons/thumb/2/2e/Fontanier_de_Vassal.jpg/400px-Fontanier_de_Vassal.jpg","year":1295},"wiki":"Fortanerius_Vassalli","year":1295,"subtype":"people","type":"i"} {"_id":"https://upload.wikimedia.org/wikipedia/commons/2/2e/Fontanier_de_Vassal.jpg","name":"Fortanerius Vassalli","coo":[1.53,44.674],"type":"p","year":1295}
ae|ruler|SPA -linked- https://upload.wikimedia.org/wikipedia/commons/a/ac/Cardenal_Pedro_Ferriz.jpg 200
ae|ruler|SPA -linked- Pedro_Ferris 200
https://upload.wikimedia.org/wikipedia/commons/a/ac/Cardenal_Pedro_Ferriz.jpg -linked- Pedro_Ferris 200
  metadata added
OOOOOOO 404 MARKER, adding next   Fortanerius_Vassalli
{ linkedItemType1: 'metadata',
  linkedItemType2: 'metadata',
  linkedItemKey1: 'ae|ruler|FRA',
  linkedItemKey2: 'https://upload.wikimedia.org/wikipedia/commons/2/2e/Fontanier_de_Vassal.jpg',
  type1: 'e',
  type2: 'e' }
{ linkedItemType1: 'metadata',
  linkedItemType2: 'markers',
  linkedItemKey1: 'ae|ruler|FRA',
  linkedItemKey2: 'Fortanerius_Vassalli',
  type1: 'a',
  type2: 'a' }
{ linkedItemType1: 'metadata',
  linkedItemType2: 'markers',
  linkedItemKey1: 'https://upload.wikimedia.org/wikipedia/commons/2/2e/Fontanier_de_Vassal.jpg',
  linkedItemKey2: 'Fortanerius_Vassalli',
  type1: 'e',
  type2: 'e' }
next
Q1772330 1395 Wincenty Kot undefined Q54187 Q36 Wincenty%20Kot.PNG Poland POL
!!!!!!!!! QID Q54187
marker success addedd
!!!!!!!!! coo [ 17.233, 52.333 ]
!!!!!!!!! coo [ 17.233, 52.333 ]
  [ 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/02/Wincenty_Kot.PNG/400px-Wincenty_Kot.PNG',
  'https://upload.wikimedia.org/wikipedia/commons/0/02/Wincenty_Kot.PNG' ]
{"_id":"https://upload.wikimedia.org/wikipedia/commons/0/02/Wincenty_Kot.PNG","data":{"title":"Wincenty Kot","poster":"https://upload.wikimedia.org/wikipedia/commons/thumb/0/02/Wincenty_Kot.PNG/400px-Wincenty_Kot.PNG","year":1395},"wiki":"Wincenty_Kot","year":1395,"subtype":"people","type":"i"} {"_id":"https://upload.wikimedia.org/wikipedia/commons/0/02/Wincenty_Kot.PNG","name":"Wincenty Kot","coo":[17.233,52.333],"type":"p","year":1395}
ae|ruler|FRA -linked- https://upload.wikimedia.org/wikipedia/commons/2/2e/Fontanier_de_Vassal.jpg 200
https://upload.wikimedia.org/wikipedia/commons/2/2e/Fontanier_de_Vassal.jpg -linked- Fortanerius_Vassalli 200
  ae|ruler|FRA -linked- Fortanerius_Vassalli 200
metadata added
OOOOOOO 404 MARKER, adding next   Wincenty_Kot
{ linkedItemType1: 'metadata',
  linkedItemType2: 'metadata',
  linkedItemKey1: 'ae|ruler|POL',
  linkedItemKey2: 'https://upload.wikimedia.org/wikipedia/commons/0/02/Wincenty_Kot.PNG',
  type1: 'e',
  type2: 'e' }
{ linkedItemType1: 'metadata',
  linkedItemType2: 'markers',
  linkedItemKey1: 'ae|ruler|POL',
  linkedItemKey2: 'Wincenty_Kot',
  type1: 'a',
  type2: 'a' }
{ linkedItemType1: 'metadata',
  linkedItemType2: 'markers',
  linkedItemKey1: 'https://upload.wikimedia.org/wikipedia/commons/0/02/Wincenty_Kot.PNG',
  linkedItemKey2: 'Wincenty_Kot',
  type1: 'e',
  type2: 'e' }
next
Q1777502 1296 Shi Nai'an undefined Q42622 Q29520 Statue%20of%20Shi%20Naian.jpg  undefined
!!!!!!!!! QID Q42622
!!!!!!!!! coo [ 120.616, 31.304 ]
!!!!!!!!! coo [ 120.616, 31.304 ]
marker success addedd
ae|ruler|POL -linked- https://upload.wikimedia.org/wikipedia/commons/0/02/Wincenty_Kot.PNG 200
[ 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5a/Statue_of_Shi_Naian.jpg/400px-Statue_of_Shi_Naian.jpg',
  'https://upload.wikimedia.org/wikipedia/commons/5/5a/Statue_of_Shi_Naian.jpg' ]
{"_id":"https://upload.wikimedia.org/wikipedia/commons/5/5a/Statue_of_Shi_Naian.jpg","data":{"title":"Shi Nai'an","poster":"https://upload.wikimedia.org/wikipedia/commons/thumb/5/5a/Statue_of_Shi_Naian.jpg/400px-Statue_of_Shi_Naian.jpg","year":1296},"wiki":"Shi_Nai'an","year":1296,"subtype":"people","type":"i"} {"_id":"https://upload.wikimedia.org/wikipedia/commons/5/5a/Statue_of_Shi_Naian.jpg","name":"Shi Nai'an","coo":[120.616,31.304],"type":"p","year":1296}
ae|ruler|POL -linked- Wincenty_Kot 200
https://upload.wikimedia.org/wikipedia/commons/0/02/Wincenty_Kot.PNG -linked- Wincenty_Kot 200
  metadata added
OOOOOOO 404 MARKER, adding next   Shi_Nai'an
{ linkedItemType1: 'metadata',
  linkedItemType2: 'markers',
  linkedItemKey1: 'https://upload.wikimedia.org/wikipedia/commons/5/5a/Statue_of_Shi_Naian.jpg',
  linkedItemKey2: 'Shi_Nai\'an',
  type1: 'e',
  type2: 'e' }
next
Q1779020 1065 Godric of Finchale undefined Q4983143 Q174193 Godric-Finchale.jpg United_Kingdom_of_Great_Britain_and_Ireland undefined
!!!!!!!!! QID Q4983143
!!!!!!!!! coo [ 0.216, 52.73 ]
!!!!!!!!! coo [ 0.216, 52.73 ]
marker success addedd
https://upload.wikimedia.org/wikipedia/commons/5/5a/Statue_of_Shi_Naian.jpg -linked- Shi_Nai'an 200
  [ 'https://upload.wikimedia.org/wikipedia/commons/e/e2/Godric-Finchale.jpg',
    'https://upload.wikimedia.org/wikipedia/commons/e/e2/Godric-Finchale.jpg' ]
{"_id":"https://upload.wikimedia.org/wikipedia/commons/e/e2/Godric-Finchale.jpg","data":{"title":"Godric of Finchale","poster":"https://upload.wikimedia.org/wikipedia/commons/e/e2/Godric-Finchale.jpg","year":1065},"wiki":"Godric_of_Finchale","year":1065,"subtype":"people","type":"i"} {"_id":"https://upload.wikimedia.org/wikipedia/commons/e/e2/Godric-Finchale.jpg","name":"Godric of Finchale","coo":[0.216,52.73],"type":"p","year":1065}
metadata added
OOOOOOO 404 MARKER, adding next   Godric_of_Finchale
{ linkedItemType1: 'metadata',
  linkedItemType2: 'markers',
  linkedItemKey1: 'https://upload.wikimedia.org/wikipedia/commons/e/e2/Godric-Finchale.jpg',
  linkedItemKey2: 'Godric_of_Finchale',
  type1: 'e',
  type2: 'e' }
next
marker success addedd
Q1782123 1240 Conrad de Lichtenberg undefined Q21568 Q142 Gisant%20de%20Conrad%20de%20Lichtenberg.JPG France FRA
!!!!!!!!! QID Q21568
!!!!!!!!! coo [ 7.481, 48.921 ]
!!!!!!!!! coo [ 7.481, 48.921 ]
https://upload.wikimedia.org/wikipedia/commons/e/e2/Godric-Finchale.jpg -linked- Godric_of_Finchale 200
  [ 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/28/Gisant_de_Conrad_de_Lichtenberg.JPG/400px-Gisant_de_Conrad_de_Lichtenberg.JPG',
    'https://upload.wikimedia.org/wikipedia/commons/thumb/2/28/Gisant_de_Conrad_de_Lichtenberg.JPG/1024px-Gisant_de_Conrad_de_Lichtenberg.JPG' ]
{"_id":"https://upload.wikimedia.org/wikipedia/commons/thumb/2/28/Gisant_de_Conrad_de_Lichtenberg.JPG/1024px-Gisant_de_Conrad_de_Lichtenberg.JPG","data":{"title":"Conrad of Lichtenberg","poster":"https://upload.wikimedia.org/wikipedia/commons/thumb/2/28/Gisant_de_Conrad_de_Lichtenberg.JPG/400px-Gisant_de_Conrad_de_Lichtenberg.JPG","year":1240},"wiki":"Conrad_of_Lichtenberg","year":1240,"subtype":"people","type":"i"} {"_id":"https://upload.wikimedia.org/wikipedia/commons/thumb/2/28/Gisant_de_Conrad_de_Lichtenberg.JPG/1024px-Gisant_de_Conrad_de_Lichtenberg.JPG","name":"Conrad of Lichtenberg","coo":[7.481,48.921],"type":"p","year":1240}
metadata added
OOOOOOO 404 MARKER, adding next   Conrad_of_Lichtenberg
{ linkedItemType1: 'metadata',
  linkedItemType2: 'metadata',
  linkedItemKey1: 'ae|ruler|FRA',
  linkedItemKey2: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/28/Gisant_de_Conrad_de_Lichtenberg.JPG/1024px-Gisant_de_Conrad_de_Lichtenberg.JPG',
  type1: 'e',
  type2: 'e' }
{ linkedItemType1: 'metadata',
  linkedItemType2: 'markers',
  linkedItemKey1: 'ae|ruler|FRA',
  linkedItemKey2: 'Conrad_of_Lichtenberg',
  type1: 'a',
  type2: 'a' }
{ linkedItemType1: 'metadata',
  linkedItemType2: 'markers',
  linkedItemKey1: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/28/Gisant_de_Conrad_de_Lichtenberg.JPG/1024px-Gisant_de_Conrad_de_Lichtenberg.JPG',
  linkedItemKey2: 'Conrad_of_Lichtenberg',
  type1: 'e',
  type2: 'e' }
next
Q1782412 1185 Konrad von Eberstein undefined Q432902 Q183 Grabmal%20Eberhard%20von%20Eberstein.jpg Germany GER
!!!!!!!!! QID Q432902
marker success addedd
!!!!!!!!! coo [ 8.271, 48.784 ]
!!!!!!!!! coo [ 8.271, 48.784 ]
Q1786825 1270 Andrew Harclay, 1st Earl of Carlisle undefined Q23326 Q174193 Andrew%20Harclay.jpg United_Kingdom_of_Great_Britain_and_Ireland undefined
!!!!!!!!! QID Q23326
!!!!!!!!! coo [ -2.583, 54.5 ]
!!!!!!!!! coo [ -2.583, 54.5 ]
  [ 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/6d/Andrew_Harclay.jpg/400px-Andrew_Harclay.jpg',
  'https://upload.wikimedia.org/wikipedia/commons/6/6d/Andrew_Harclay.jpg' ]
{"_id":"https://upload.wikimedia.org/wikipedia/commons/6/6d/Andrew_Harclay.jpg","data":{"title":"Andrew Harclay, 1st Earl of Carlisle","poster":"https://upload.wikimedia.org/wikipedia/commons/thumb/6/6d/Andrew_Harclay.jpg/400px-Andrew_Harclay.jpg","year":1270},"wiki":"Andrew_Harclay,_1st_Earl_of_Carlisle","year":1270,"subtype":"people","type":"i"} {"_id":"https://upload.wikimedia.org/wikipedia/commons/6/6d/Andrew_Harclay.jpg","name":"Andrew Harclay, 1st Earl of Carlisle","coo":[-2.583,54.5],"type":"p","year":1270}
https://upload.wikimedia.org/wikipedia/commons/thumb/2/28/Gisant_de_Conrad_de_Lichtenberg.JPG/1024px-Gisant_de_Conrad_de_Lichtenberg.JPG -linked- Conrad_of_Lichtenberg 200
  ae|ruler|FRA -linked- https://upload.wikimedia.org/wikipedia/commons/thumb/2/28/Gisant_de_Conrad_de_Lichtenberg.JPG/1024px-Gisant_de_Conrad_de_Lichtenberg.JPG 200
ae|ruler|FRA -linked- Conrad_of_Lichtenberg 200
metadata added
OOOOOOO 404 MARKER, adding next   Andrew_Harclay,_1st_Earl_of_Carlisle
{ linkedItemType1: 'metadata',
  linkedItemType2: 'markers',
  linkedItemKey1: 'https://upload.wikimedia.org/wikipedia/commons/6/6d/Andrew_Harclay.jpg',
  linkedItemKey2: 'Andrew_Harclay,_1st_Earl_of_Carlisle',
  type1: 'e',
  type2: 'e' }
next
marker success addedd
Q1796659 1234 Christina of Norway, Infanta of Castile undefined Q26793 Q20 Covarrubias%20-%20Estatua%20de%20la%20princesa%20Kristina.jpg Norway NOR
!!!!!!!!! QID Q26793
!!!!!!!!! coo [ 5.323, 60.393 ]
!!!!!!!!! coo [ 5.323, 60.393 ]
https://upload.wikimedia.org/wikipedia/commons/6/6d/Andrew_Harclay.jpg -linked- Andrew_Harclay,_1st_Earl_of_Carlisle 200
  [ 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/05/Covarrubias_-_Estatua_de_la_princesa_Kristina.jpg/400px-Covarrubias_-_Estatua_de_la_princesa_Kristina.jpg',
    'https://upload.wikimedia.org/wikipedia/commons/thumb/0/05/Covarrubias_-_Estatua_de_la_princesa_Kristina.jpg/1024px-Covarrubias_-_Estatua_de_la_princesa_Kristina.jpg' ]
{"_id":"https://upload.wikimedia.org/wikipedia/commons/thumb/0/05/Covarrubias_-_Estatua_de_la_princesa_Kristina.jpg/1024px-Covarrubias_-_Estatua_de_la_princesa_Kristina.jpg","data":{"title":"Christina of Norway, Infanta of Castile","poster":"https://upload.wikimedia.org/wikipedia/commons/thumb/0/05/Covarrubias_-_Estatua_de_la_princesa_Kristina.jpg/400px-Covarrubias_-_Estatua_de_la_princesa_Kristina.jpg","year":1234},"wiki":"Christina_of_Norway,_Infanta_of_Castile","year":1234,"subtype":"people","type":"i"} {"_id":"https://upload.wikimedia.org/wikipedia/commons/thumb/0/05/Covarrubias_-_Estatua_de_la_princesa_Kristina.jpg/1024px-Covarrubias_-_Estatua_de_la_princesa_Kristina.jpg","name":"Christina of Norway, Infanta of Castile","coo":[5.323,60.393],"type":"p","year":1234}
metadata added
OOOOOOO 404 MARKER, adding next   Christina_of_Norway,_Infanta_of_Castile
{ linkedItemType1: 'metadata',
  linkedItemType2: 'metadata',
  linkedItemKey1: 'ae|ruler|NOR',
  linkedItemKey2: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/05/Covarrubias_-_Estatua_de_la_princesa_Kristina.jpg/1024px-Covarrubias_-_Estatua_de_la_princesa_Kristina.jpg',
  type1: 'e',
  type2: 'e' }
{ linkedItemType1: 'metadata',
  linkedItemType2: 'markers',
  linkedItemKey1: 'ae|ruler|NOR',
  linkedItemKey2: 'Christina_of_Norway,_Infanta_of_Castile',
  type1: 'a',
  type2: 'a' }
{ linkedItemType1: 'metadata',
  linkedItemType2: 'markers',
  linkedItemKey1: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/05/Covarrubias_-_Estatua_de_la_princesa_Kristina.jpg/1024px-Covarrubias_-_Estatua_de_la_princesa_Kristina.jpg',
  linkedItemKey2: 'Christina_of_Norway,_Infanta_of_Castile',
  type1: 'e',
  type2: 'e' }
next
Q1808208 1110 Lawrence of Durham undefined Q2462706 Q179876 Lawrence%20of%20Durham.jpg Kingdom_of_England undefined
!!!!!!!!! QID Q2462706
!!!!!!!!! coo [ 0, 51.685 ]
!!!!!!!!! coo [ 0, 51.685 ]
marker success addedd
  [ 'https://upload.wikimedia.org/wikipedia/commons/e/ef/Lawrence_of_Durham.jpg',
  'https://upload.wikimedia.org/wikipedia/commons/e/ef/Lawrence_of_Durham.jpg' ]
{"_id":"https://upload.wikimedia.org/wikipedia/commons/e/ef/Lawrence_of_Durham.jpg","data":{"title":"Lawrence of Durham","poster":"https://upload.wikimedia.org/wikipedia/commons/e/ef/Lawrence_of_Durham.jpg","year":1110},"wiki":"Lawrence_of_Durham","year":1110,"subtype":"people","type":"i"} {"_id":"https://upload.wikimedia.org/wikipedia/commons/e/ef/Lawrence_of_Durham.jpg","name":"Lawrence of Durham","coo":[0,51.685],"type":"p","year":1110}
https://upload.wikimedia.org/wikipedia/commons/thumb/0/05/Covarrubias_-_Estatua_de_la_princesa_Kristina.jpg/1024px-Covarrubias_-_Estatua_de_la_princesa_Kristina.jpg -linked- Christina_of_Norway,_Infanta_of_Castile 200
  ae|ruler|NOR -linked- Christina_of_Norway,_Infanta_of_Castile 200
ae|ruler|NOR -linked- https://upload.wikimedia.org/wikipedia/commons/thumb/0/05/Covarrubias_-_Estatua_de_la_princesa_Kristina.jpg/1024px-Covarrubias_-_Estatua_de_la_princesa_Kristina.jpg 200
metadata added
OOOOOOO 404 MARKER, adding next   Lawrence_of_Durham
{ linkedItemType1: 'metadata',
  linkedItemType2: 'markers',
  linkedItemKey1: 'https://upload.wikimedia.org/wikipedia/commons/e/ef/Lawrence_of_Durham.jpg',
  linkedItemKey2: 'Lawrence_of_Durham',
  type1: 'e',
  type2: 'e' }
next
Q1851906 1350 Paul of Burgos undefined Q9580 Q29 Pablo%20de%20Santa%20Maria.jpg Spain SPA
!!!!!!!!! QID Q9580
!!!!!!!!! coo [ -3.7, 42.341 ]
!!!!!!!!! coo [ -3.7, 42.341 ]
marker success addedd
https://upload.wikimedia.org/wikipedia/commons/e/ef/Lawrence_of_Durham.jpg -linked- Lawrence_of_Durham 200
  [ 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a9/Pablo_de_Santa_Maria.jpg/400px-Pablo_de_Santa_Maria.jpg',
    'https://upload.wikimedia.org/wikipedia/commons/a/a9/Pablo_de_Santa_Maria.jpg' ]
{"_id":"https://upload.wikimedia.org/wikipedia/commons/a/a9/Pablo_de_Santa_Maria.jpg","data":{"title":"Paul of Burgos","poster":"https://upload.wikimedia.org/wikipedia/commons/thumb/a/a9/Pablo_de_Santa_Maria.jpg/400px-Pablo_de_Santa_Maria.jpg","year":1350},"wiki":"Paul_of_Burgos","year":1350,"subtype":"people","type":"i"} {"_id":"https://upload.wikimedia.org/wikipedia/commons/a/a9/Pablo_de_Santa_Maria.jpg","name":"Paul of Burgos","coo":[-3.7,42.341],"type":"p","year":1350}
metadata added
OOOOOOO 404 MARKER, adding next   Paul_of_Burgos
{ linkedItemType1: 'metadata',
  linkedItemType2: 'metadata',
  linkedItemKey1: 'ae|ruler|SPA',
  linkedItemKey2: 'https://upload.wikimedia.org/wikipedia/commons/a/a9/Pablo_de_Santa_Maria.jpg',
  type1: 'e',
  type2: 'e' }
{ linkedItemType1: 'metadata',
  linkedItemType2: 'markers',
  linkedItemKey1: 'ae|ruler|SPA',
  linkedItemKey2: 'Paul_of_Burgos',
  type1: 'a',
  type2: 'a' }
{ linkedItemType1: 'metadata',
  linkedItemType2: 'markers',
  linkedItemKey1: 'https://upload.wikimedia.org/wikipedia/commons/a/a9/Pablo_de_Santa_Maria.jpg',
  linkedItemKey2: 'Paul_of_Burgos',
  type1: 'e',
  type2: 'e' }
next
Q1854324 1405 Simon de Lalaing undefined Q665525 Q4712 Simon%20de%20Lalaing%20%281405-1477%29.jpg Duchy_of_Burgundy undefined
!!!!!!!!! QID Q665525
!!!!!!!!! coo [ 3.187, 50.367 ]
!!!!!!!!! coo [ 3.187, 50.367 ]
  [ 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/46/Simon_de_Lalaing_%281405-1477%29.jpg/400px-Simon_de_Lalaing_%281405-1477%29.jpg',
  'https://upload.wikimedia.org/wikipedia/commons/4/46/Simon_de_Lalaing_%281405-1477%29.jpg' ]
{"_id":"https://upload.wikimedia.org/wikipedia/commons/4/46/Simon_de_Lalaing_%281405-1477%29.jpg","data":{"title":"Simon de Lalaing","poster":"https://upload.wikimedia.org/wikipedia/commons/thumb/4/46/Simon_de_Lalaing_%281405-1477%29.jpg/400px-Simon_de_Lalaing_%281405-1477%29.jpg","year":1405},"wiki":"Simon_de_Lalaing","year":1405,"subtype":"people","type":"i"} {"_id":"https://upload.wikimedia.org/wikipedia/commons/4/46/Simon_de_Lalaing_%281405-1477%29.jpg","name":"Simon de Lalaing","coo":[3.187,50.367],"type":"p","year":1405}
marker success addedd
ae|ruler|SPA -linked- https://upload.wikimedia.org/wikipedia/commons/a/a9/Pablo_de_Santa_Maria.jpg 200
https://upload.wikimedia.org/wikipedia/commons/a/a9/Pablo_de_Santa_Maria.jpg -linked- Paul_of_Burgos 200
  ae|ruler|SPA -linked- Paul_of_Burgos 200
metadata added
OOOOOOO 404 MARKER, adding next   Simon_de_Lalaing
{ linkedItemType1: 'metadata',
  linkedItemType2: 'markers',
  linkedItemKey1: 'https://upload.wikimedia.org/wikipedia/commons/4/46/Simon_de_Lalaing_%281405-1477%29.jpg',
  linkedItemKey2: 'Simon_de_Lalaing',
  type1: 'e',
  type2: 'e' }
next
marker success addedd
Q1860408 1225 Saint Alice undefined Q12887 Q31 Schaerbeek%20Eglise%20Sainte-Alice%20010.jpg Belgium BEL
!!!!!!!!! QID Q12887
!!!!!!!!! coo [ 4.367, 50.85 ]
!!!!!!!!! coo [ 4.367, 50.85 ]
  [ 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/dd/Schaerbeek_Eglise_Sainte-Alice_010.jpg/400px-Schaerbeek_Eglise_Sainte-Alice_010.jpg',
  'https://upload.wikimedia.org/wikipedia/commons/thumb/d/dd/Schaerbeek_Eglise_Sainte-Alice_010.jpg/1024px-Schaerbeek_Eglise_Sainte-Alice_010.jpg' ]
{"_id":"https://upload.wikimedia.org/wikipedia/commons/thumb/d/dd/Schaerbeek_Eglise_Sainte-Alice_010.jpg/1024px-Schaerbeek_Eglise_Sainte-Alice_010.jpg","data":{"title":"Alice of Schaerbeek","poster":"https://upload.wikimedia.org/wikipedia/commons/thumb/d/dd/Schaerbeek_Eglise_Sainte-Alice_010.jpg/400px-Schaerbeek_Eglise_Sainte-Alice_010.jpg","year":1225},"wiki":"Alice_of_Schaerbeek","year":1225,"subtype":"people","type":"i"} {"_id":"https://upload.wikimedia.org/wikipedia/commons/thumb/d/dd/Schaerbeek_Eglise_Sainte-Alice_010.jpg/1024px-Schaerbeek_Eglise_Sainte-Alice_010.jpg","name":"Alice of Schaerbeek","coo":[4.367,50.85],"type":"p","year":1225}
https://upload.wikimedia.org/wikipedia/commons/4/46/Simon_de_Lalaing_%281405-1477%29.jpg -linked- Simon_de_Lalaing 200
  metadata added
OOOOOOO 404 MARKER, adding next   Alice_of_Schaerbeek
{ linkedItemType1: 'metadata',
  linkedItemType2: 'metadata',
  linkedItemKey1: 'ae|ruler|BEL',
  linkedItemKey2: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/dd/Schaerbeek_Eglise_Sainte-Alice_010.jpg/1024px-Schaerbeek_Eglise_Sainte-Alice_010.jpg',
  type1: 'e',
  type2: 'e' }
{ linkedItemType1: 'metadata',
  linkedItemType2: 'markers',
  linkedItemKey1: 'ae|ruler|BEL',
  linkedItemKey2: 'Alice_of_Schaerbeek',
  type1: 'a',
  type2: 'a' }
{ linkedItemType1: 'metadata',
  linkedItemType2: 'markers',
  linkedItemKey1: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/dd/Schaerbeek_Eglise_Sainte-Alice_010.jpg/1024px-Schaerbeek_Eglise_Sainte-Alice_010.jpg',
  linkedItemKey2: 'Alice_of_Schaerbeek',
  type1: 'e',
  type2: 'e' }
next
Q1866362 1418 John of Burgundy, Bishop of Cambrai undefined Q7003 Q55 Jean%20de%20Bourgogne%2C%20Bishop%20of%20Cambrai%2C%20by%20follower%20of%20Rogier%20van%20der%20Weyden.jpg Netherlands NED
!!!!!!!!! QID Q7003
!!!!!!!!! coo [ 5.042, 47.323 ]
!!!!!!!!! coo [ 5.042, 47.323 ]
  [ 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/97/Jean_de_Bourgogne%2C_Bishop_of_Cambrai%2C_by_follower_of_Rogier_van_der_Weyden.jpg/400px-Jean_de_Bourgogne%2C_Bishop_of_Cambrai%2C_by_follower_of_Rogier_van_der_Weyden.jpg',
  'https://upload.wikimedia.org/wikipedia/commons/thumb/9/97/Jean_de_Bourgogne%2C_Bishop_of_Cambrai%2C_by_follower_of_Rogier_van_der_Weyden.jpg/1024px-Jean_de_Bourgogne%2C_Bishop_of_Cambrai%2C_by_follower_of_Rogier_van_der_Weyden.jpg' ]
{"_id":"https://upload.wikimedia.org/wikipedia/commons/thumb/9/97/Jean_de_Bourgogne%2C_Bishop_of_Cambrai%2C_by_follower_of_Rogier_van_der_Weyden.jpg/1024px-Jean_de_Bourgogne%2C_Bishop_of_Cambrai%2C_by_follower_of_Rogier_van_der_Weyden.jpg","data":{"title":"John of Burgundy (bishop of Cambrai)","poster":"https://upload.wikimedia.org/wikipedia/commons/thumb/9/97/Jean_de_Bourgogne%2C_Bishop_of_Cambrai%2C_by_follower_of_Rogier_van_der_Weyden.jpg/400px-Jean_de_Bourgogne%2C_Bishop_of_Cambrai%2C_by_follower_of_Rogier_van_der_Weyden.jpg","year":1418},"wiki":"John_of_Burgundy_(bishop_of_Cambrai)","year":1418,"subtype":"people","type":"i"} {"_id":"https://upload.wikimedia.org/wikipedia/commons/thumb/9/97/Jean_de_Bourgogne%2C_Bishop_of_Cambrai%2C_by_follower_of_Rogier_van_der_Weyden.jpg/1024px-Jean_de_Bourgogne%2C_Bishop_of_Cambrai%2C_by_follower_of_Rogier_van_der_Weyden.jpg","name":"John of Burgundy (bishop of Cambrai)","coo":[5.042,47.323],"type":"p","year":1418}
marker success addedd
ae|ruler|BEL -linked- Alice_of_Schaerbeek 200
https://upload.wikimedia.org/wikipedia/commons/thumb/d/dd/Schaerbeek_Eglise_Sainte-Alice_010.jpg/1024px-Schaerbeek_Eglise_Sainte-Alice_010.jpg -linked- Alice_of_Schaerbeek 200
  ae|ruler|BEL -linked- https://upload.wikimedia.org/wikipedia/commons/thumb/d/dd/Schaerbeek_Eglise_Sainte-Alice_010.jpg/1024px-Schaerbeek_Eglise_Sainte-Alice_010.jpg 200
metadata added
OOOOOOO 404 MARKER, adding next   John_of_Burgundy_(bishop_of_Cambrai)
{ linkedItemType1: 'metadata',
  linkedItemType2: 'metadata',
  linkedItemKey1: 'ae|ruler|NED',
  linkedItemKey2: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/97/Jean_de_Bourgogne%2C_Bishop_of_Cambrai%2C_by_follower_of_Rogier_van_der_Weyden.jpg/1024px-Jean_de_Bourgogne%2C_Bishop_of_Cambrai%2C_by_follower_of_Rogier_van_der_Weyden.jpg',
  type1: 'e',
  type2: 'e' }
{ linkedItemType1: 'metadata',
  linkedItemType2: 'markers',
  linkedItemKey1: 'ae|ruler|NED',
  linkedItemKey2: 'John_of_Burgundy_(bishop_of_Cambrai)',
  type1: 'a',
  type2: 'a' }
{ linkedItemType1: 'metadata',
  linkedItemType2: 'markers',
  linkedItemKey1: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/97/Jean_de_Bourgogne%2C_Bishop_of_Cambrai%2C_by_follower_of_Rogier_van_der_Weyden.jpg/1024px-Jean_de_Bourgogne%2C_Bishop_of_Cambrai%2C_by_follower_of_Rogier_van_der_Weyden.jpg',
  linkedItemKey2: 'John_of_Burgundy_(bishop_of_Cambrai)',
  type1: 'e',
  type2: 'e' }
next
Q1875299 1244 Louis of France undefined t1122693438 Q142 Louis%2C%20fils%20Louis%20IX.jpg France FRA
!!!!!!!!! QID t1122693438
marker success addedd
!!!!!!!!! coo undefined
  [ 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/45/Louis%2C_fils_Louis_IX.jpg/400px-Louis%2C_fils_Louis_IX.jpg',
  'https://upload.wikimedia.org/wikipedia/commons/4/45/Louis%2C_fils_Louis_IX.jpg' ]
{"_id":"https://upload.wikimedia.org/wikipedia/commons/4/45/Louis%2C_fils_Louis_IX.jpg","data":{"title":"Louis of France (1244–1260)","poster":"https://upload.wikimedia.org/wikipedia/commons/thumb/4/45/Louis%2C_fils_Louis_IX.jpg/400px-Louis%2C_fils_Louis_IX.jpg","year":1244},"wiki":"Louis_of_France_(1244–1260)","year":1244,"subtype":"people","type":"i"} {"_id":"https://upload.wikimedia.org/wikipedia/commons/4/45/Louis%2C_fils_Louis_IX.jpg","name":"Louis of France (1244–1260)","type":"p","year":1244}
ae|ruler|NED -linked- https://upload.wikimedia.org/wikipedia/commons/thumb/9/97/Jean_de_Bourgogne%2C_Bishop_of_Cambrai%2C_by_follower_of_Rogier_van_der_Weyden.jpg/1024px-Jean_de_Bourgogne%2C_Bishop_of_Cambrai%2C_by_follower_of_Rogier_van_der_Weyden.jpg 200
ae|ruler|NED -linked- John_of_Burgundy_(bishop_of_Cambrai) 200
https://upload.wikimedia.org/wikipedia/commons/thumb/9/97/Jean_de_Bourgogne%2C_Bishop_of_Cambrai%2C_by_follower_of_Rogier_van_der_Weyden.jpg/1024px-Jean_de_Bourgogne%2C_Bishop_of_Cambrai%2C_by_follower_of_Rogier_van_der_Weyden.jpg -linked- John_of_Burgundy_(bishop_of_Cambrai) 200
  metadata added
OOOOOOO 404 MARKER, adding next   Louis_of_France_(1244–1260)
{ linkedItemType1: 'metadata',
  linkedItemType2: 'metadata',
  linkedItemKey1: 'ae|ruler|FRA',
  linkedItemKey2: 'https://upload.wikimedia.org/wikipedia/commons/4/45/Louis%2C_fils_Louis_IX.jpg',
  type1: 'e',
  type2: 'e' }
{ linkedItemType1: 'metadata',
  linkedItemType2: 'markers',
  linkedItemKey1: 'ae|ruler|FRA',
  linkedItemKey2: 'Louis_of_France_(1244–1260)',
  type1: 'a',
  type2: 'a' }
{ linkedItemType1: 'metadata',
  linkedItemType2: 'markers',
  linkedItemKey1: 'https://upload.wikimedia.org/wikipedia/commons/4/45/Louis%2C_fils_Louis_IX.jpg',
  linkedItemKey2: 'Louis_of_France_(1244–1260)',
  type1: 'e',
  type2: 'e' }
next
Q1876861 1274 Lukardis von Oberweimar undefined Q1729 Q183 Stiftskirche%20Baumgartenberg%20Kanzel03.jpg Germany GER
!!!!!!!!! QID Q1729
marker success addedd
!!!!!!!!! coo [ 11.029, 50.978 ]
!!!!!!!!! coo [ 11.029, 50.978 ]
Q1884931 1033 Gertrude of Saxony undefined Q4126 Q183 Gertrude%20de%20Saxe.png Germany GER
!!!!!!!!! QID Q4126
ae|ruler|FRA -linked- Louis_of_France_(1244–1260) 200
!!!!!!!!! coo [ 10.233, 50.05 ]
!!!!!!!!! coo [ 10.233, 50.05 ]
ae|ruler|FRA -linked- https://upload.wikimedia.org/wikipedia/commons/4/45/Louis%2C_fils_Louis_IX.jpg 200
https://upload.wikimedia.org/wikipedia/commons/4/45/Louis%2C_fils_Louis_IX.jpg -linked- Louis_of_France_(1244–1260) 200
  [ 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/65/Gertrude_de_Saxe.png/400px-Gertrude_de_Saxe.png',
    'https://upload.wikimedia.org/wikipedia/commons/6/65/Gertrude_de_Saxe.png' ]
{"_id":"https://upload.wikimedia.org/wikipedia/commons/6/65/Gertrude_de_Saxe.png","data":{"title":"Gertrude of Saxony","poster":"https://upload.wikimedia.org/wikipedia/commons/thumb/6/65/Gertrude_de_Saxe.png/400px-Gertrude_de_Saxe.png","year":1033},"wiki":"Gertrude_of_Saxony","year":1033,"subtype":"people","type":"i"} {"_id":"https://upload.wikimedia.org/wikipedia/commons/6/65/Gertrude_de_Saxe.png","name":"Gertrude of Saxony","coo":[10.233,50.05],"type":"p","year":1033}
metadata added
OOOOOOO 404 MARKER, adding next   Gertrude_of_Saxony
{ linkedItemType1: 'metadata',
  linkedItemType2: 'metadata',
  linkedItemKey1: 'ae|ruler|GER',
  linkedItemKey2: 'https://upload.wikimedia.org/wikipedia/commons/6/65/Gertrude_de_Saxe.png',
  type1: 'e',
  type2: 'e' }
{ linkedItemType1: 'metadata',
  linkedItemType2: 'markers',
  linkedItemKey1: 'ae|ruler|GER',
  linkedItemKey2: 'Gertrude_of_Saxony',
  type1: 'a',
  type2: 'a' }
{ linkedItemType1: 'metadata',
  linkedItemType2: 'markers',
  linkedItemKey1: 'https://upload.wikimedia.org/wikipedia/commons/6/65/Gertrude_de_Saxe.png',
  linkedItemKey2: 'Gertrude_of_Saxony',
  type1: 'e',
  type2: 'e' }
next
Q1893721 1285 Marco Cornaro undefined Q641 Q4948 Doge%20Marco%20Cornaro%20portrait.JPG Republic_of_Venice undefined
!!!!!!!!! QID Q641
marker success addedd
!!!!!!!!! coo [ 12.332, 45.44 ]
!!!!!!!!! coo [ 12.332, 45.44 ]
  [ 'https://upload.wikimedia.org/wikipedia/commons/4/4c/Doge_Marco_Cornaro_portrait.JPG',
  'https://upload.wikimedia.org/wikipedia/commons/4/4c/Doge_Marco_Cornaro_portrait.JPG' ]
{"_id":"https://upload.wikimedia.org/wikipedia/commons/4/4c/Doge_Marco_Cornaro_portrait.JPG","data":{"title":"Marco Cornaro","poster":"https://upload.wikimedia.org/wikipedia/commons/4/4c/Doge_Marco_Cornaro_portrait.JPG","year":1285},"wiki":"Marco_Cornaro","year":1285,"subtype":"people","type":"i"} {"_id":"https://upload.wikimedia.org/wikipedia/commons/4/4c/Doge_Marco_Cornaro_portrait.JPG","name":"Marco Cornaro","coo":[12.332,45.44],"type":"p","year":1285}
ae|ruler|GER -linked- https://upload.wikimedia.org/wikipedia/commons/6/65/Gertrude_de_Saxe.png 200
https://upload.wikimedia.org/wikipedia/commons/6/65/Gertrude_de_Saxe.png -linked- Gertrude_of_Saxony 200
  ae|ruler|GER -linked- Gertrude_of_Saxony 200
metadata added
OOOOOOO 404 MARKER, adding next   Marco_Cornaro
{ linkedItemType1: 'metadata',
  linkedItemType2: 'markers',
  linkedItemKey1: 'https://upload.wikimedia.org/wikipedia/commons/4/4c/Doge_Marco_Cornaro_portrait.JPG',
  linkedItemKey2: 'Marco_Cornaro',
  type1: 'e',
  type2: 'e' }
next
Q1924075 1310 Berenguer de Cruïlles undefined Q1022932 Q29 Berenguer%20de%20cruilles%20bisbe%20donant%20detall%20hor.jpg Spain SPA
!!!!!!!!! QID Q1022932
!!!!!!!!! coo [ 3.09, 41.978 ]
!!!!!!!!! coo [ 3.09, 41.978 ]
marker success addedd
https://upload.wikimedia.org/wikipedia/commons/4/4c/Doge_Marco_Cornaro_portrait.JPG -linked- Marco_Cornaro 200
  [ 'https://upload.wikimedia.org/wikipedia/commons/5/56/Berenguer_de_cruilles_bisbe_donant_detall_hor.jpg',
    'https://upload.wikimedia.org/wikipedia/commons/5/56/Berenguer_de_cruilles_bisbe_donant_detall_hor.jpg' ]
{"_id":"https://upload.wikimedia.org/wikipedia/commons/5/56/Berenguer_de_cruilles_bisbe_donant_detall_hor.jpg","data":{"title":"Berenguer de Cruïlles","poster":"https://upload.wikimedia.org/wikipedia/commons/5/56/Berenguer_de_cruilles_bisbe_donant_detall_hor.jpg","year":1310},"wiki":"Berenguer_de_Cruïlles","year":1310,"subtype":"people","type":"i"} {"_id":"https://upload.wikimedia.org/wikipedia/commons/5/56/Berenguer_de_cruilles_bisbe_donant_detall_hor.jpg","name":"Berenguer de Cruïlles","coo":[3.09,41.978],"type":"p","year":1310}
metadata added
OOOOOOO 404 MARKER, adding next   Berenguer_de_Cruïlles
{ linkedItemType1: 'metadata',
  linkedItemType2: 'metadata',
  linkedItemKey1: 'ae|ruler|SPA',
  linkedItemKey2: 'https://upload.wikimedia.org/wikipedia/commons/5/56/Berenguer_de_cruilles_bisbe_donant_detall_hor.jpg',
  type1: 'e',
  type2: 'e' }
{ linkedItemType1: 'metadata',
  linkedItemType2: 'markers',
  linkedItemKey1: 'ae|ruler|SPA',
  linkedItemKey2: 'Berenguer_de_Cruïlles',
  type1: 'a',
  type2: 'a' }
{ linkedItemType1: 'metadata',
  linkedItemType2: 'markers',
  linkedItemKey1: 'https://upload.wikimedia.org/wikipedia/commons/5/56/Berenguer_de_cruilles_bisbe_donant_detall_hor.jpg',
  linkedItemKey2: 'Berenguer_de_Cruïlles',
  type1: 'e',
  type2: 'e' }
next
Q1931114 1308 Michele Morosini undefined Q641 Q4948 Choir%20of%20Santi%20Giovanni%20e%20Paolo%20%28Venice%29%20-%20Monument%20to%20doge%20Michele%20Morosini%20-%20Close-up.jpg Republic_of_Venice undefined
!!!!!!!!! QID Q641
!!!!!!!!! coo [ 12.332, 45.44 ]
!!!!!!!!! coo [ 12.332, 45.44 ]
marker success addedd
  [ 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/77/Choir_of_Santi_Giovanni_e_Paolo_%28Venice%29_-_Monument_to_doge_Michele_Morosini_-_Close-up.jpg/400px-Choir_of_Santi_Giovanni_e_Paolo_%28Venice%29_-_Monument_to_doge_Michele_Morosini_-_Close-up.jpg',
  'https://upload.wikimedia.org/wikipedia/commons/thumb/7/77/Choir_of_Santi_Giovanni_e_Paolo_%28Venice%29_-_Monument_to_doge_Michele_Morosini_-_Close-up.jpg/1024px-Choir_of_Santi_Giovanni_e_Paolo_%28Venice%29_-_Monument_to_doge_Michele_Morosini_-_Close-up.jpg' ]
{"_id":"https://upload.wikimedia.org/wikipedia/commons/thumb/7/77/Choir_of_Santi_Giovanni_e_Paolo_%28Venice%29_-_Monument_to_doge_Michele_Morosini_-_Close-up.jpg/1024px-Choir_of_Santi_Giovanni_e_Paolo_%28Venice%29_-_Monument_to_doge_Michele_Morosini_-_Close-up.jpg","data":{"title":"Michele Morosini","poster":"https://upload.wikimedia.org/wikipedia/commons/thumb/7/77/Choir_of_Santi_Giovanni_e_Paolo_%28Venice%29_-_Monument_to_doge_Michele_Morosini_-_Close-up.jpg/400px-Choir_of_Santi_Giovanni_e_Paolo_%28Venice%29_-_Monument_to_doge_Michele_Morosini_-_Close-up.jpg","year":1308},"wiki":"Michele_Morosini","year":1308,"subtype":"people","type":"i"} {"_id":"https://upload.wikimedia.org/wikipedia/commons/thumb/7/77/Choir_of_Santi_Giovanni_e_Paolo_%28Venice%29_-_Monument_to_doge_Michele_Morosini_-_Close-up.jpg/1024px-Choir_of_Santi_Giovanni_e_Paolo_%28Venice%29_-_Monument_to_doge_Michele_Morosini_-_Close-up.jpg","name":"Michele Morosini","coo":[12.332,45.44],"type":"p","year":1308}
ae|ruler|SPA -linked- https://upload.wikimedia.org/wikipedia/commons/5/56/Berenguer_de_cruilles_bisbe_donant_detall_hor.jpg 200
ae|ruler|SPA -linked- Berenguer_de_Cruïlles 200
https://upload.wikimedia.org/wikipedia/commons/5/56/Berenguer_de_cruilles_bisbe_donant_detall_hor.jpg -linked- Berenguer_de_Cruïlles 200
  metadata added
!!!! WE FOUND MARKER   Michele_Morosini
{ linkedItemType1: 'metadata',
  linkedItemType2: 'markers',
  linkedItemKey1: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/77/Choir_of_Santi_Giovanni_e_Paolo_%28Venice%29_-_Monument_to_doge_Michele_Morosini_-_Close-up.jpg/1024px-Choir_of_Santi_Giovanni_e_Paolo_%28Venice%29_-_Monument_to_doge_Michele_Morosini_-_Close-up.jpg',
  linkedItemKey2: 'Michele_Morosini',
  type1: 'e',
  type2: 'e' }
next
Q1931293 1238 Petrus Armengol undefined Q11930549 Q29 Pedro%20Armengol.jpg Spain SPA
!!!!!!!!! QID Q11930549
!!!!!!!!! coo [ 1.171, 41.397 ]
!!!!!!!!! coo [ 1.171, 41.397 ]
https://upload.wikimedia.org/wikipedia/commons/thumb/7/77/Choir_of_Santi_Giovanni_e_Paolo_%28Venice%29_-_Monument_to_doge_Michele_Morosini_-_Close-up.jpg/1024px-Choir_of_Santi_Giovanni_e_Paolo_%28Venice%29_-_Monument_to_doge_Michele_Morosini_-_Close-up.jpg -linked- Michele_Morosini 200
  [ 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b6/Pedro_Armengol.jpg/400px-Pedro_Armengol.jpg',
    'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b6/Pedro_Armengol.jpg/1024px-Pedro_Armengol.jpg' ]
{"_id":"https://upload.wikimedia.org/wikipedia/commons/thumb/b/b6/Pedro_Armengol.jpg/1024px-Pedro_Armengol.jpg","data":{"title":"Pedro Armengol","poster":"https://upload.wikimedia.org/wikipedia/commons/thumb/b/b6/Pedro_Armengol.jpg/400px-Pedro_Armengol.jpg","year":1238},"wiki":"Pedro_Armengol","year":1238,"subtype":"people","type":"i"} {"_id":"https://upload.wikimedia.org/wikipedia/commons/thumb/b/b6/Pedro_Armengol.jpg/1024px-Pedro_Armengol.jpg","name":"Pedro Armengol","coo":[1.171,41.397],"type":"p","year":1238}
metadata added
OOOOOOO 404 MARKER, adding next   Pedro_Armengol
{ linkedItemType1: 'metadata',
  linkedItemType2: 'metadata',
  linkedItemKey1: 'ae|ruler|SPA',
  linkedItemKey2: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b6/Pedro_Armengol.jpg/1024px-Pedro_Armengol.jpg',
  type1: 'e',
  type2: 'e' }
{ linkedItemType1: 'metadata',
  linkedItemType2: 'markers',
  linkedItemKey1: 'ae|ruler|SPA',
  linkedItemKey2: 'Pedro_Armengol',
  type1: 'a',
  type2: 'a' }
{ linkedItemType1: 'metadata',
  linkedItemType2: 'markers',
  linkedItemKey1: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b6/Pedro_Armengol.jpg/1024px-Pedro_Armengol.jpg',
  linkedItemKey2: 'Pedro_Armengol',
  type1: 'e',
  type2: 'e' }
next
Q1935678 1200 Milon de Nanteuil undefined Q90 Q142 Coronation%20of%20Louis%20VIII%20and%20Blanche%20of%20Castille%201223.jpg France FRA
!!!!!!!!! QID Q90
!!!!!!!!! coo [ 2.352, 48.857 ]
!!!!!!!!! coo [ 2.352, 48.857 ]
marker success addedd
  [ 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3b/Coronation_of_Louis_VIII_and_Blanche_of_Castille_1223.jpg/400px-Coronation_of_Louis_VIII_and_Blanche_of_Castille_1223.jpg',
  'https://upload.wikimedia.org/wikipedia/commons/3/3b/Coronation_of_Louis_VIII_and_Blanche_of_Castille_1223.jpg' ]
{"_id":"https://upload.wikimedia.org/wikipedia/commons/3/3b/Coronation_of_Louis_VIII_and_Blanche_of_Castille_1223.jpg","data":{"title":"Milo of Nanteuil","poster":"https://upload.wikimedia.org/wikipedia/commons/thumb/3/3b/Coronation_of_Louis_VIII_and_Blanche_of_Castille_1223.jpg/400px-Coronation_of_Louis_VIII_and_Blanche_of_Castille_1223.jpg","year":1200},"wiki":"Milo_of_Nanteuil","year":1200,"subtype":"people","type":"i"} {"_id":"https://upload.wikimedia.org/wikipedia/commons/3/3b/Coronation_of_Louis_VIII_and_Blanche_of_Castille_1223.jpg","name":"Milo of Nanteuil","coo":[2.352,48.857],"type":"p","year":1200}
ae|ruler|SPA -linked- https://upload.wikimedia.org/wikipedia/commons/thumb/b/b6/Pedro_Armengol.jpg/1024px-Pedro_Armengol.jpg 200
https://upload.wikimedia.org/wikipedia/commons/thumb/b/b6/Pedro_Armengol.jpg/1024px-Pedro_Armengol.jpg -linked- Pedro_Armengol 200
  ae|ruler|SPA -linked- Pedro_Armengol 200
metadata added
OOOOOOO 404 MARKER, adding next   Milo_of_Nanteuil
{ linkedItemType1: 'metadata',
  linkedItemType2: 'metadata',
  linkedItemKey1: 'ae|ruler|FRA',
  linkedItemKey2: 'https://upload.wikimedia.org/wikipedia/commons/3/3b/Coronation_of_Louis_VIII_and_Blanche_of_Castille_1223.jpg',
  type1: 'e',
  type2: 'e' }
{ linkedItemType1: 'metadata',
  linkedItemType2: 'markers',
  linkedItemKey1: 'ae|ruler|FRA',
  linkedItemKey2: 'Milo_of_Nanteuil',
  type1: 'a',
  type2: 'a' }
{ linkedItemType1: 'metadata',
  linkedItemType2: 'markers',
  linkedItemKey1: 'https://upload.wikimedia.org/wikipedia/commons/3/3b/Coronation_of_Louis_VIII_and_Blanche_of_Castille_1223.jpg',
  linkedItemKey2: 'Milo_of_Nanteuil',
  type1: 'e',
  type2: 'e' }
next
Q1962277 1153 Nerses of Lambron undefined Q1801490 Q335088 Nerses%20Lambronatsi.jpg Armenian_Kingdom_of_Cilicia undefined
!!!!!!!!! QID Q1801490
!!!!!!!!! coo [ 37.166, 37.166 ]
!!!!!!!!! coo [ 37.166, 37.166 ]
marker success addedd
  [ 'https://upload.wikimedia.org/wikipedia/commons/0/05/Nerses_Lambronatsi.jpg',
  'https://upload.wikimedia.org/wikipedia/commons/0/05/Nerses_Lambronatsi.jpg' ]
{"_id":"https://upload.wikimedia.org/wikipedia/commons/0/05/Nerses_Lambronatsi.jpg","data":{"title":"Nerses of Lambron","poster":"https://upload.wikimedia.org/wikipedia/commons/0/05/Nerses_Lambronatsi.jpg","year":1153},"wiki":"Nerses_of_Lambron","year":1153,"subtype":"people","type":"i"} {"_id":"https://upload.wikimedia.org/wikipedia/commons/0/05/Nerses_Lambronatsi.jpg","name":"Nerses of Lambron","coo":[37.166,37.166],"type":"p","year":1153}
ae|ruler|FRA -linked- https://upload.wikimedia.org/wikipedia/commons/3/3b/Coronation_of_Louis_VIII_and_Blanche_of_Castille_1223.jpg 200
ae|ruler|FRA -linked- Milo_of_Nanteuil 200
https://upload.wikimedia.org/wikipedia/commons/3/3b/Coronation_of_Louis_VIII_and_Blanche_of_Castille_1223.jpg -linked- Milo_of_Nanteuil 200
  metadata added
OOOOOOO 404 MARKER, adding next   Nerses_of_Lambron
{ linkedItemType1: 'metadata',
  linkedItemType2: 'markers',
  linkedItemKey1: 'https://upload.wikimedia.org/wikipedia/commons/0/05/Nerses_Lambronatsi.jpg',
  linkedItemKey2: 'Nerses_of_Lambron',
  type1: 'e',
  type2: 'e' }
next
Q1969164 1270 Nicholas of Lyra undefined Q774199 Q142 Nicolas%20de%20Lyre%2008539%20C%26H%20Piqueret1479.JPG France FRA
!!!!!!!!! QID Q774199
!!!!!!!!! coo [ 0.75, 48.918 ]
!!!!!!!!! coo [ 0.75, 48.918 ]
marker success addedd
https://upload.wikimedia.org/wikipedia/commons/0/05/Nerses_Lambronatsi.jpg -linked- Nerses_of_Lambron 200
  [ 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2e/Nicolas_de_Lyre_08539_C%26H_Piqueret1479.JPG/400px-Nicolas_de_Lyre_08539_C%26H_Piqueret1479.JPG',
    'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2e/Nicolas_de_Lyre_08539_C%26H_Piqueret1479.JPG/1024px-Nicolas_de_Lyre_08539_C%26H_Piqueret1479.JPG' ]
{"_id":"https://upload.wikimedia.org/wikipedia/commons/thumb/2/2e/Nicolas_de_Lyre_08539_C%26H_Piqueret1479.JPG/1024px-Nicolas_de_Lyre_08539_C%26H_Piqueret1479.JPG","data":{"title":"Nicholas of Lyra","poster":"https://upload.wikimedia.org/wikipedia/commons/thumb/2/2e/Nicolas_de_Lyre_08539_C%26H_Piqueret1479.JPG/400px-Nicolas_de_Lyre_08539_C%26H_Piqueret1479.JPG","year":1270},"wiki":"Nicholas_of_Lyra","year":1270,"subtype":"people","type":"i"} {"_id":"https://upload.wikimedia.org/wikipedia/commons/thumb/2/2e/Nicolas_de_Lyre_08539_C%26H_Piqueret1479.JPG/1024px-Nicolas_de_Lyre_08539_C%26H_Piqueret1479.JPG","name":"Nicholas of Lyra","coo":[0.75,48.918],"type":"p","year":1270}
metadata added
OOOOOOO 404 MARKER, adding next   Nicholas_of_Lyra
{ linkedItemType1: 'metadata',
  linkedItemType2: 'metadata',
  linkedItemKey1: 'ae|ruler|FRA',
  linkedItemKey2: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2e/Nicolas_de_Lyre_08539_C%26H_Piqueret1479.JPG/1024px-Nicolas_de_Lyre_08539_C%26H_Piqueret1479.JPG',
  type1: 'e',
  type2: 'e' }
{ linkedItemType1: 'metadata',
  linkedItemType2: 'markers',
  linkedItemKey1: 'ae|ruler|FRA',
  linkedItemKey2: 'Nicholas_of_Lyra',
  type1: 'a',
  type2: 'a' }
{ linkedItemType1: 'metadata',
  linkedItemType2: 'markers',
  linkedItemKey1: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2e/Nicolas_de_Lyre_08539_C%26H_Piqueret1479.JPG/1024px-Nicolas_de_Lyre_08539_C%26H_Piqueret1479.JPG',
  linkedItemKey2: 'Nicholas_of_Lyra',
  type1: 'e',
  type2: 'e' }
next
Q1972589 1364 Ralph de Neville, 1st Earl of Westmorland undefined Q179815 Q174193 Ralph%20Neville%2C%201st%20Earl%20of%20Westmorland.png United_Kingdom_of_Great_Britain_and_Ireland undefined
!!!!!!!!! QID Q179815
!!!!!!!!! coo [ -1.567, 54.783 ]
!!!!!!!!! coo [ -1.567, 54.783 ]
marker success addedd
  [ 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/90/Ralph_Neville%2C_1st_Earl_of_Westmorland.png/400px-Ralph_Neville%2C_1st_Earl_of_Westmorland.png',
  'https://upload.wikimedia.org/wikipedia/commons/9/90/Ralph_Neville%2C_1st_Earl_of_Westmorland.png' ]
{"_id":"https://upload.wikimedia.org/wikipedia/commons/9/90/Ralph_Neville%2C_1st_Earl_of_Westmorland.png","data":{"title":"Ralph Neville, 1st Earl of Westmorland","poster":"https://upload.wikimedia.org/wikipedia/commons/thumb/9/90/Ralph_Neville%2C_1st_Earl_of_Westmorland.png/400px-Ralph_Neville%2C_1st_Earl_of_Westmorland.png","year":1364},"wiki":"Ralph_Neville,_1st_Earl_of_Westmorland","year":1364,"subtype":"people","type":"i"} {"_id":"https://upload.wikimedia.org/wikipedia/commons/9/90/Ralph_Neville%2C_1st_Earl_of_Westmorland.png","name":"Ralph Neville, 1st Earl of Westmorland","coo":[-1.567,54.783],"type":"p","year":1364}
ae|ruler|FRA -linked- Nicholas_of_Lyra 200
https://upload.wikimedia.org/wikipedia/commons/thumb/2/2e/Nicolas_de_Lyre_08539_C%26H_Piqueret1479.JPG/1024px-Nicolas_de_Lyre_08539_C%26H_Piqueret1479.JPG -linked- Nicholas_of_Lyra 200
  ae|ruler|FRA -linked- https://upload.wikimedia.org/wikipedia/commons/thumb/2/2e/Nicolas_de_Lyre_08539_C%26H_Piqueret1479.JPG/1024px-Nicolas_de_Lyre_08539_C%26H_Piqueret1479.JPG 200
metadata added
OOOOOOO 404 MARKER, adding next   Ralph_Neville,_1st_Earl_of_Westmorland
{ linkedItemType1: 'metadata',
  linkedItemType2: 'markers',
  linkedItemKey1: 'https://upload.wikimedia.org/wikipedia/commons/9/90/Ralph_Neville%2C_1st_Earl_of_Westmorland.png',
  linkedItemKey2: 'Ralph_Neville,_1st_Earl_of_Westmorland',
  type1: 'e',
  type2: 'e' }
next
marker success addedd
Q1974166 1165 Alberic Clement undefined Q1303414 Q142 Alb%C3%A9ric%20Cl%C3%A9ment%20%28Henri%20Decaisne%29.jpg France FRA
!!!!!!!!! QID Q1303414
!!!!!!!!! coo undefined
!!!!!!!!! coo undefined
https://upload.wikimedia.org/wikipedia/commons/9/90/Ralph_Neville%2C_1st_Earl_of_Westmorland.png -linked- Ralph_Neville,_1st_Earl_of_Westmorland 200
  [ 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/09/Alb%C3%A9ric_Cl%C3%A9ment_%28Henri_Decaisne%29.jpg/400px-Alb%C3%A9ric_Cl%C3%A9ment_%28Henri_Decaisne%29.jpg',
    'https://upload.wikimedia.org/wikipedia/commons/0/09/Alb%C3%A9ric_Cl%C3%A9ment_%28Henri_Decaisne%29.jpg' ]
{"_id":"https://upload.wikimedia.org/wikipedia/commons/0/09/Alb%C3%A9ric_Cl%C3%A9ment_%28Henri_Decaisne%29.jpg","data":{"title":"Albéric Clément","poster":"https://upload.wikimedia.org/wikipedia/commons/thumb/0/09/Alb%C3%A9ric_Cl%C3%A9ment_%28Henri_Decaisne%29.jpg/400px-Alb%C3%A9ric_Cl%C3%A9ment_%28Henri_Decaisne%29.jpg","year":1165},"wiki":"Albéric_Clément","year":1165,"subtype":"people","type":"i"} {"_id":"https://upload.wikimedia.org/wikipedia/commons/0/09/Alb%C3%A9ric_Cl%C3%A9ment_%28Henri_Decaisne%29.jpg","name":"Albéric Clément","type":"p","year":1165}
metadata added
OOOOOOO 404 MARKER, adding next   Albéric_Clément
{ linkedItemType1: 'metadata',
  linkedItemType2: 'metadata',
  linkedItemKey1: 'ae|ruler|FRA',
  linkedItemKey2: 'https://upload.wikimedia.org/wikipedia/commons/0/09/Alb%C3%A9ric_Cl%C3%A9ment_%28Henri_Decaisne%29.jpg',
  type1: 'e',
  type2: 'e' }
{ linkedItemType1: 'metadata',
  linkedItemType2: 'markers',
  linkedItemKey1: 'ae|ruler|FRA',
  linkedItemKey2: 'Albéric_Clément',
  type1: 'a',
  type2: 'a' }
{ linkedItemType1: 'metadata',
  linkedItemType2: 'markers',
  linkedItemKey1: 'https://upload.wikimedia.org/wikipedia/commons/0/09/Alb%C3%A9ric_Cl%C3%A9ment_%28Henri_Decaisne%29.jpg',
  linkedItemKey2: 'Albéric_Clément',
  type1: 'e',
  type2: 'e' }
next
Q1976986 1220 Thomas the Rhymer undefined Q1010108 Q230791 Katherine%20Cameron-Thomas%20the%20Rhymer.png Kingdom_of_Scotland undefined
!!!!!!!!! QID Q1010108
!!!!!!!!! coo [ -2.667, 55.633 ]
!!!!!!!!! coo [ -2.667, 55.633 ]
marker success addedd
  [ 'https://upload.wikimedia.org/wikipedia/commons/b/b8/Katherine_Cameron-Thomas_the_Rhymer.png',
  'https://upload.wikimedia.org/wikipedia/commons/b/b8/Katherine_Cameron-Thomas_the_Rhymer.png' ]
{"_id":"https://upload.wikimedia.org/wikipedia/commons/b/b8/Katherine_Cameron-Thomas_the_Rhymer.png","data":{"title":"Thomas the Rhymer","poster":"https://upload.wikimedia.org/wikipedia/commons/b/b8/Katherine_Cameron-Thomas_the_Rhymer.png","year":1220},"wiki":"Thomas_the_Rhymer","year":1220,"subtype":"people","type":"i"} {"_id":"https://upload.wikimedia.org/wikipedia/commons/b/b8/Katherine_Cameron-Thomas_the_Rhymer.png","name":"Thomas the Rhymer","coo":[-2.667,55.633],"type":"p","year":1220}
https://upload.wikimedia.org/wikipedia/commons/0/09/Alb%C3%A9ric_Cl%C3%A9ment_%28Henri_Decaisne%29.jpg -linked- Albéric_Clément 200
  ae|ruler|FRA -linked- https://upload.wikimedia.org/wikipedia/commons/0/09/Alb%C3%A9ric_Cl%C3%A9ment_%28Henri_Decaisne%29.jpg 200
ae|ruler|FRA -linked- Albéric_Clément 200
metadata added
OOOOOOO 404 MARKER, adding next   Thomas_the_Rhymer
{ linkedItemType1: 'metadata',
  linkedItemType2: 'markers',
  linkedItemKey1: 'https://upload.wikimedia.org/wikipedia/commons/b/b8/Katherine_Cameron-Thomas_the_Rhymer.png',
  linkedItemKey2: 'Thomas_the_Rhymer',
  type1: 'e',
  type2: 'e' }
next
Q1986864 1411 Nicolaus Pistoris undefined Q2079 Q183 Nicolaus%20Pistoris.jpg Germany GER
!!!!!!!!! QID Q2079
!!!!!!!!! coo [ 12.383, 51.333 ]
!!!!!!!!! coo [ 12.383, 51.333 ]
marker success addedd
https://upload.wikimedia.org/wikipedia/commons/b/b8/Katherine_Cameron-Thomas_the_Rhymer.png -linked- Thomas_the_Rhymer 200
  Q1990225 1073 Shaykh Tabarsi undefined Q709175 Q794 Shrine%20of%20Shaykh%20%E1%B9%ACabars%C3%AD.jpg Iran PER
!!!!!!!!! QID Q709175
!!!!!!!!! coo undefined
!!!!!!!!! coo undefined
  [ 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3d/Shrine_of_Shaykh_%E1%B9%ACabars%C3%AD.jpg/400px-Shrine_of_Shaykh_%E1%B9%ACabars%C3%AD.jpg',
  'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3d/Shrine_of_Shaykh_%E1%B9%ACabars%C3%AD.jpg/1024px-Shrine_of_Shaykh_%E1%B9%ACabars%C3%AD.jpg' ]
{"_id":"https://upload.wikimedia.org/wikipedia/commons/thumb/3/3d/Shrine_of_Shaykh_%E1%B9%ACabars%C3%AD.jpg/1024px-Shrine_of_Shaykh_%E1%B9%ACabars%C3%AD.jpg","data":{"title":"Shaykh Tabarsi","poster":"https://upload.wikimedia.org/wikipedia/commons/thumb/3/3d/Shrine_of_Shaykh_%E1%B9%ACabars%C3%AD.jpg/400px-Shrine_of_Shaykh_%E1%B9%ACabars%C3%AD.jpg","year":1073},"wiki":"Shaykh_Tabarsi","year":1073,"subtype":"people","type":"i"} {"_id":"https://upload.wikimedia.org/wikipedia/commons/thumb/3/3d/Shrine_of_Shaykh_%E1%B9%ACabars%C3%AD.jpg/1024px-Shrine_of_Shaykh_%E1%B9%ACabars%C3%AD.jpg","name":"Shaykh Tabarsi","type":"p","year":1073}
metadata added
OOOOOOO 404 MARKER, adding next   Shaykh_Tabarsi
{ linkedItemType1: 'metadata',
  linkedItemType2: 'metadata',
  linkedItemKey1: 'ae|ruler|PER',
  linkedItemKey2: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3d/Shrine_of_Shaykh_%E1%B9%ACabars%C3%AD.jpg/1024px-Shrine_of_Shaykh_%E1%B9%ACabars%C3%AD.jpg',
  type1: 'e',
  type2: 'e' }
{ linkedItemType1: 'metadata',
  linkedItemType2: 'markers',
  linkedItemKey1: 'ae|ruler|PER',
  linkedItemKey2: 'Shaykh_Tabarsi',
  type1: 'a',
  type2: 'a' }
{ linkedItemType1: 'metadata',
  linkedItemType2: 'markers',
  linkedItemKey1: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3d/Shrine_of_Shaykh_%E1%B9%ACabars%C3%AD.jpg/1024px-Shrine_of_Shaykh_%E1%B9%ACabars%C3%AD.jpg',
  linkedItemKey2: 'Shaykh_Tabarsi',
  type1: 'e',
  type2: 'e' }
next
Q1991150 1155 Margaret of Sweden, Queen of Norway undefined Q34 Q34 Erican%20Dynasty%20heraldic%20lions%20%28drawing%201996%29.jpg Sweden SWE
!!!!!!!!! QID Q34
marker success addedd
!!!!!!!!! coo [ 15, 61 ]
!!!!!!!!! coo [ 15, 61 ]
  [ 'https://upload.wikimedia.org/wikipedia/commons/f/f7/Erican_Dynasty_heraldic_lions_%28drawing_1996%29.jpg',
  'https://upload.wikimedia.org/wikipedia/commons/f/f7/Erican_Dynasty_heraldic_lions_%28drawing_1996%29.jpg' ]
{"_id":"https://upload.wikimedia.org/wikipedia/commons/f/f7/Erican_Dynasty_heraldic_lions_%28drawing_1996%29.jpg","data":{"title":"Margaret of Sweden, Queen of Norway","poster":"https://upload.wikimedia.org/wikipedia/commons/f/f7/Erican_Dynasty_heraldic_lions_%28drawing_1996%29.jpg","year":1155},"wiki":"Margaret_of_Sweden,_Queen_of_Norway","year":1155,"subtype":"people","type":"i"} {"_id":"https://upload.wikimedia.org/wikipedia/commons/f/f7/Erican_Dynasty_heraldic_lions_%28drawing_1996%29.jpg","name":"Margaret of Sweden, Queen of Norway","coo":[15,61],"type":"p","year":1155}
ae|ruler|PER -linked- Shaykh_Tabarsi 200
https://upload.wikimedia.org/wikipedia/commons/thumb/3/3d/Shrine_of_Shaykh_%E1%B9%ACabars%C3%AD.jpg/1024px-Shrine_of_Shaykh_%E1%B9%ACabars%C3%AD.jpg -linked- Shaykh_Tabarsi 200
  ae|ruler|PER -linked- https://upload.wikimedia.org/wikipedia/commons/thumb/3/3d/Shrine_of_Shaykh_%E1%B9%ACabars%C3%AD.jpg/1024px-Shrine_of_Shaykh_%E1%B9%ACabars%C3%AD.jpg 200
metadata added
OOOOOOO 404 MARKER, adding next   Margaret_of_Sweden,_Queen_of_Norway
{ linkedItemType1: 'metadata',
  linkedItemType2: 'metadata',
  linkedItemKey1: 'ae|ruler|SWE',
  linkedItemKey2: 'https://upload.wikimedia.org/wikipedia/commons/f/f7/Erican_Dynasty_heraldic_lions_%28drawing_1996%29.jpg',
  type1: 'e',
  type2: 'e' }
{ linkedItemType1: 'metadata',
  linkedItemType2: 'markers',
  linkedItemKey1: 'ae|ruler|SWE',
  linkedItemKey2: 'Margaret_of_Sweden,_Queen_of_Norway',
  type1: 'a',
  type2: 'a' }
{ linkedItemType1: 'metadata',
  linkedItemType2: 'markers',
  linkedItemKey1: 'https://upload.wikimedia.org/wikipedia/commons/f/f7/Erican_Dynasty_heraldic_lions_%28drawing_1996%29.jpg',
  linkedItemKey2: 'Margaret_of_Sweden,_Queen_of_Norway',
  type1: 'e',
  type2: 'e' }
next
marker success addedd
Q1991425 1350 Nikolaus Faber undefined Q16069 Q183 Nikolaus%20Faber.JPG Germany GER
!!!!!!!!! QID Q16069
!!!!!!!!! coo [ 9.789, 48.098 ]
!!!!!!!!! coo [ 9.789, 48.098 ]
Q1993768 1201 István Báncsa undefined Q28 Q28 B%C3%A1ncsa%20Istv%C3%A1n%201255.JPG Hungary HUN
!!!!!!!!! QID Q28
!!!!!!!!! coo [ 19, 47 ]
!!!!!!!!! coo [ 19, 47 ]
ae|ruler|SWE -linked- https://upload.wikimedia.org/wikipedia/commons/f/f7/Erican_Dynasty_heraldic_lions_%28drawing_1996%29.jpg 200
ae|ruler|SWE -linked- Margaret_of_Sweden,_Queen_of_Norway 200
  [ 'https://upload.wikimedia.org/wikipedia/commons/f/f6/B%C3%A1ncsa_Istv%C3%A1n_1255.JPG',
  'https://upload.wikimedia.org/wikipedia/commons/f/f6/B%C3%A1ncsa_Istv%C3%A1n_1255.JPG' ]
{"_id":"https://upload.wikimedia.org/wikipedia/commons/f/f6/B%C3%A1ncsa_Istv%C3%A1n_1255.JPG","data":{"title":"Stephen I Báncsa","poster":"https://upload.wikimedia.org/wikipedia/commons/f/f6/B%C3%A1ncsa_Istv%C3%A1n_1255.JPG","year":1201},"wiki":"Stephen_I_Báncsa","year":1201,"subtype":"people","type":"i"} {"_id":"https://upload.wikimedia.org/wikipedia/commons/f/f6/B%C3%A1ncsa_Istv%C3%A1n_1255.JPG","name":"Stephen I Báncsa","coo":[19,47],"type":"p","year":1201}
^C
*/

fetch("http://localhost:4040/v1/metadata/ruler")
  .then(response => response.json())
  .then((resRulList) => {
    rulerObject = resRulList.data
    fetch("https://query.wikidata.org/sparql?format=json&query=SELECT%20%3Fs%20%3Fborn%20%3Fdeath%20%3Fdesc%20%3Fpicture%20%3Frul%20%3FbornPlace%20%3Fcoo%0AWHERE%0A%7B%0A%20%20%3Fs%20wdt%3AP31%20wd%3AQ5%3B%0A%20%20%20%20%20%20%20%20wdt%3AP18%20%3Fpicture%3B%0A%20%20%20%20%20%20%20%20wdt%3AP27%20%3Frul%3B%0A%20%20%20%20%20%20%20%20wdt%3AP19%20%3FbornPlace%3B%0A%20%20%20%20%20wdt%3AP569%20%3Fborn%20.%0A%20%20optional%20%7B%3Fs%20wdt%3AP570%20%3Fdeath.%0A%20%20%20%20%20%20%20%20%20%20%20%3Fs%20wdt%3AP495%20%3Fcoo.%7D%0A%20%20FILTER%20%28%3Fborn%20%3C%3D%20%221024-01-01T00%3A00%3A00Z%22%5E%5Exsd%3AdateTime%29%20.%0A%20%20%20%20%3Fs%20rdfs%3Alabel%20%3Fdesc%20FILTER%28lang%28%3Fdesc%29%3D%22en%22%29.%0A%20%20%3Fs%20wikibase%3Asitelinks%20%3Fsitelinks.%0A%20%20service%20wikibase%3Alabel%20%7B%20bd%3AserviceParam%20wikibase%3Alanguage%20%22%5BAUTO_LANGUAGE%5D%2Cen%22.%20%7D%0A%7D%20")//SELECT%20%3Fs%20%3Fborn%20%3Fdeath%20%3Fdesc%20%3Fpicture%20%3Frul%20%3FbornPlace%20%3Fcoo%0AWHERE%0A%7B%0A%20%20%3Fs%20wdt%3AP31%20wd%3AQ5%3B%0A%20%20%20%20%20%20%20%20wdt%3AP18%20%3Fpicture%3B%0A%20%20%20%20%20%20%20%20wdt%3AP27%20%3Frul%3B%0A%20%20%20%20%20%20%20%20wdt%3AP19%20%3FbornPlace%3B%0A%20%20%20%20%20wdt%3AP569%20%3Fborn%20.%0A%20%20optional%20%7B%3Fs%20wdt%3AP570%20%3Fdeath.%0A%20%20%20%20%20%20%20%20%20%20%20%3Fs%20wdt%3AP495%20%3Fcoo.%7D%0A%20%20FILTER%20%28%3Fborn%20%3E%20%22" + process.argv[2] + "-01-01T00%3A00%3A00Z%22%5E%5Exsd%3AdateTime%20%26%26%20%3Fborn%20%3C%3D%20%22" + process.argv[3] + "-01-01T00%3A00%3A00Z%22%5E%5Exsd%3AdateTime%29%20.%0A%20%20%20%20%3Fs%20rdfs%3Alabel%20%3Fdesc%20FILTER%28lang%28%3Fdesc%29%3D%22en%22%29.%0A%20%20%3Fs%20wikibase%3Asitelinks%20%3Fsitelinks.%0A%20%20service%20wikibase%3Alabel%20%7B%20bd%3AserviceParam%20wikibase%3Alanguage%20%22%5BAUTO_LANGUAGE%5D%2Cen%22.%20%7D%0A%7D%20%20order%20by%20desc%28%3Fsitelinks%29%20limit%201000")
      .then(response => response.json())
      .then((resQids) => {
        const rulList = resQids.results.bindings.map((qEl) => {
          const url = (qEl.s || {}).value
          const label = (qEl.desc || {}).value
          const year = (qEl.born || {}).value
          const end = (qEl.death || {}).value
          const bornPlaceQid = (qEl.bornPlace || {}).value
          const rulerQid = (qEl.rul || {}).value
          const imageQid = ((qEl.picture || {}).value || "").substr(51)

          return [
            url.substr(url.lastIndexOf("/") + 1),
            getYear(year),
            label,
            getYear(end),
            bornPlaceQid && bornPlaceQid.substr(bornPlaceQid.lastIndexOf("/") + 1),
            rulerQid && rulerQid.substr(rulerQid.lastIndexOf("/") + 1),
            imageQid
            ]
        })

        rulList.reduce(
            (p, x) => p.then((_) => {
              return postRulPlus(x[0],x[1],x[2],x[3],x[4],x[5],x[6])
            }),
            Promise.resolve()
          )
      })
    })


postRulPlus = (qElId,year,label,end,bornPlaceQid,rulerQID,imageNameJPG) => new Promise((resolve, reject) => {
  if (alreadyProcessed.includes(qElId)) return resolve()
  alreadyProcessed.push(qElId)

  // utils.getEnWikiByQID(bornPlaceQid)
  //   .then((authorWiki) => {
      utils.getEnWikiByQID(rulerQID)
        .then((rulerWiki) => {


          const rulKeys = Object.keys(rulerObject)
          const rulerAcc = rulKeys[Object.values(rulerObject).findIndex(el => el[2] === rulerWiki)]

          console.debug(qElId,year,label,end,bornPlaceQid,rulerQID,imageNameJPG,rulerWiki, rulerAcc)

          utils.getCooFromQid(bornPlaceQid)
            .then((coo) => {
              console.debug("!!!!!!!!! coo", coo)
          return fetch("https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&ids=" + qElId + "&languages=en&props=sitelinks|claims")
            .then(response => response.json())
            .then((resQel) => {
              const qEl = resQel.entities[qElId]
              const qElClaims = qEl.claims

              const enWiki = (((qEl.sitelinks || {}).enwiki || {}).title || "").replace(/ /g, "_")

              if (!enWiki) return resolve()

              const citizenQid = (((((qElClaims.P27 || [])[0] || {}).mainsnak || {}).datavalue || {}).value || {}).id

              utils.getResolution("File:" + imageNameJPG, 400, 1024)
                .then((imageUrl) => {
                  console.debug(imageUrl)
                  if (!imageUrl) return resolve()

                  // warPushed.push(epicId)
                  // if (warPushed.includes(epicId)) {
                  //   entityName = fileName.replace(".txt","").replace(/ /g, "_")
                  //   epicId = "e_" +  entityName
                  // }
                  const epicObjectToPost = {
                    "_id": imageUrl[1],
                    "data": {
                      "title": enWiki.replace(/_/g, " "),
                      "poster": imageUrl[0],
                      "year": +year,
                      "end": end,
                    },
                    "wiki": enWiki,
                    "year": +year,
                    "subtype": "people",
                    "type": "i"
                  }

                  console.debug(JSON.stringify(epicObjectToPost),JSON.stringify({
                    _id: imageUrl[1],
                    name: enWiki.replace(/_/g, " "),
                    coo,
                    type: 'p',
                    // subtype: allMarkers[markerIndex][3],
                    year,
                    end,
                  }))

                  // return resolve()
                  fetch(`${properties.chronasApiHost}/metadata`, {
                    method: 'POST',
                    body: JSON.stringify(epicObjectToPost),
                    headers: {
                      'Content-Type': 'application/json',
                      Authorization: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6InVzZXJAa2V5c3RvbmVqcy5jb20iLCJ1c2VybmFtZSI6ImRpenp5LXdhc3RlIiwibGFzdFVwZGF0ZWQiOiIyMDE4LTAzLTAyVDE5OjE3OjI0LjU2M1oiLCJwcml2aWxlZ2UiOjEsImlhdCI6MTUyMDM5NzcwMX0.o4PX-DUixjEWOqUKyhL3F2ck4DJI6zKfmuc-0YvMERU'
                    },
                  })
                    .then((response) => {
                      if (response.status < 200 || response.status >= 300) {
                        console.log('metadata failed', response.status, JSON.stringify(epicObjectToPost))
                        //return resolve()
                      }
                      //else {
                        console.log('metadata added')

                        // add defendends and attackers to war

                        let toLink = []
                        if (rulerAcc) {
                          toLink.push(["metadata","metadata","ae|ruler|"+rulerAcc,imageUrl[1],"e","e"])
                          toLink.push(["metadata","markers","ae|ruler|"+rulerAcc,enWiki,"a","a"])
                          toLink.push(["markers","metadata",enWiki,"ae|ruler|"+rulerAcc,"a","a"])
                        }

                      toLink.push(["metadata","markers",imageUrl[1],enWiki,"e","e"])
                      toLink.push(["markers","metadata",enWiki,imageUrl[1],"e","e"])

                        new Promise((resolve, reject) => {
                          fetch(`${properties.chronasApiHost}/markers/${enWiki}`)
                            .then(res => {
                              resolve(res.status === 200)
                            })
                            .catch(err => {
                              console.debug("!! ERR MARKER  ", enWiki)
                              return resolve(false)
                            })
                        }).then((authorExists) => {
                          if (authorExists) {

                            console.debug("!!!! WE FOUND MARKER  ", enWiki)
                          }
                          else {
                            console.debug("OOOOOOO 404 MARKER, adding next  ", enWiki)
                            // added.push(wikiURL)
                            const bodyMarkerToPost = {
                              _id: enWiki,
                              name: enWiki.replace(/_/g, " "),
                              coo,
                              type: 'p',
                              // subtype: allMarkers[markerIndex][3],
                              year,
                              end,
                            }

                            fetch(`${properties.chronasApiHost}/markers`, {
                              method: 'POST',
                              body: JSON.stringify(bodyMarkerToPost),
                              headers: {
                                'Content-Type': 'application/json',
                                Authorization: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6InVzZXJAa2V5c3RvbmVqcy5jb20iLCJ1c2VybmFtZSI6ImRpenp5LXdhc3RlIiwibGFzdFVwZGF0ZWQiOiIyMDE4LTAzLTAyVDE5OjE3OjI0LjU2M1oiLCJwcml2aWxlZ2UiOjEsImlhdCI6MTUyMDM5NzcwMX0.o4PX-DUixjEWOqUKyhL3F2ck4DJI6zKfmuc-0YvMERU'
                              },
                            })
                              .then((response) => {
                                if (response.status < 200 || response.status >= 300) {
                                  console.log('marker failed', response.statusText, JSON.stringify(bodyMarkerToPost))
                                } else {
                                  console.log(`marker success addedd`)
                                }
                              })
                              .catch((err) => {
                                console.log('err catch', err)
                              })
                          }

                          toLink.reduce(
                            (p, rulerId) => p.then((tata) => {
                              if (!rulerId[0]) return
                              const linkObject = {
                                "linkedItemType1": rulerId[0],
                                "linkedItemType2": rulerId[1],
                                "linkedItemKey1": rulerId[2],
                                "linkedItemKey2": rulerId[3],
                                "type1": rulerId[4],
                                "type2": rulerId[5],//"e" // a = map, e = media (?)
                              }
                              console.debug(linkObject)
                              return new Promise((resolve, reject) => {
                                fetch(`${properties.chronasApiHost}/metadata/links/addLink`, {
                                  method: 'PUT',
                                  body: JSON.stringify(linkObject),
                                  headers: {
                                    'Content-Type': 'application/json',
                                    Authorization: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6InVzZXJAa2V5c3RvbmVqcy5jb20iLCJ1c2VybmFtZSI6ImRpenp5LXdhc3RlIiwibGFzdFVwZGF0ZWQiOiIyMDE4LTAzLTAyVDE5OjE3OjI0LjU2M1oiLCJwcml2aWxlZ2UiOjEsImlhdCI6MTUyMDM5NzcwMX0.o4PX-DUixjEWOqUKyhL3F2ck4DJI6zKfmuc-0YvMERU'
                                  },
                                })
                                  .then(response => {
                                    console.debug(rulerId[2], '-linked-', rulerId[3], response.status);
                                    resolve()
                                  })
                                  .catch((err) => {
                                    console.debug(err);
                                    resolve()
                                  })
                              })
                              // return handleWarFile(x)
                            }),
                            Promise.resolve()
                          ).then(() => {console.debug('next'); resolve()})
                        })
                      // }
                    })
                    .catch((err) => {
                      console.debug("2ERRRRRRRRRROR", err)
                      return resolve()
                    })

                })
            })
            })
            .catch(err => resolve())
        })
    // })
})

