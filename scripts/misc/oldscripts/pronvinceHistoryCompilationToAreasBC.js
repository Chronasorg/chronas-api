const fetch = require('node-fetch')
const fs = require('fs')
const resolve = require('path').resolve
// const LineReader = require('linereader')
var lineReader = require('line-reader');
const folderDir = resolve("../../misc/oldscripts/")

const properties = {
  chronasApiHost: 'http://localhost:4040/v1'
}
const missing = {
  "Cuenca":"Soria",
  "Okanagan":"Secwepemc","Siknikt":"Kespek","Jurua":"Acre State","Aru Moluccan\"":"Fak-Fak","Rio Madeira":"Manaus","Oiapoque":"Tucujulandia","Inhambupe":"Bahia","Mato Caceres":"Xeres","Itapua":"Misiones","Montevideo":"Colonia","Iquique":"Arica","Tiahuanaco":"Arequipa","Quillacas":"Iquique","Potosi":"Caracara","Tarija":"Sucre","Fuerte Borbon":"Chaco Boreal","Réunion":"Antananarivo","Santa Cruz de la Sierra":"Sucre","Chimbote":"Huaraz","Huaraz":"Chimbote","Puerto Carreno":"Upper Orinoco","Merca":"Afgooye","Tizapan":"Huichol","Colima":"Apatzingan","Zacatula":"Apatzingan","Cihuatlan":"Cutzamala","Coixtlahuacan":"Tlapanec","Huizhou Wu":"Poyang","Lakota West":"Tsisistas","West Timor":"Timor","Edmonton":"Ktunaxa","Acre State":"Quero","Upper Orinoco":"Puerto Carreno","Djibouti":"Mora","Närke":"Östergötland","Ojibwa":"Wappus","Acadia":"Eskikewakik","Lakota East":"Minnesota","Mexico":"Huastec","Belize":"Uaymil","Guatemala":"Iximche","Barinas":"Merida","Guayaquil":"Santa Ana","Huanuco":"Huaraz","Cajamarca":"Tucume","Tarma":"Lima","Lima":"Tarma","Cuzco":"Huancavelica","Chaco Boreal":"Melodia","Arica":"Iquique","Mbaracayu":"Xeres","Espirito Santo":"Vila Rica","Shaanxi":"Yan'an","Puerto Rico":"Barahonas","Havana":"Moron","Bahamas":"Camaguey","Qaraqalpak":"Gurganj","Dumat":"Tayma","Lithuania":"Lida","Krakow":"Carpathia","Schwyz":"Lombardia","Larissa":"Kozani","Secwepemc":"Okanagan","Nihithawak":"Alberta","Eskikewakik":"Acadia","Kespukwitk":"Acadia","Jicarilla West":"Pueblo","Llanos":"Apure","Uyapari":"Cumana","Melodia":"Chaco Central","Chiquiyami":"Chanar","Chubut":"Poya","Macaya":"Puno","Chachapoyas":"Quijos","Esmeraldas":"Quito","Guaviare":"Inner Colombia","Cutzamala":"Cihuatlan","Tepeacac":"Cholula","Champutun":"Petén","Chortli":"Olancho","Ahqaf":"Najran","Dobruja":"Budjak","Columbia":"Nisga'a","Chipewyan":"Quennebigon","Swampy Cree":"Atikaki","Kespek":"Siknikt","Micmac":"Epekwitk","Nootka":"Kwakiutl","Jicarilla East":"Wichita","Apache":"Hopi","Mixtec":"Coyolapan","Pipil":"Lenca","Cauca":"Popayan","Caqueta":"Canelos","Santa Ana":"Wankapampa","Maynas":"Chachapoyas","Chanchan":"Pisqupampa","Huamanga":"Nazca","Moxos":"San Joaquin","Charcas":"Oruro","Banda Oriente":"Uruguay","Asyut South":"Minya","Pensa":"Alatyr","Brest":"Grodno","Hinterpommern":"Gdingen"}

let completedArea = {}

function extractValueByKeyandEnd({ line, startString, stopString }) {
  const nameIndex = line.indexOf(startString)
  const startStringLength = startString.length
  if (line.indexOf(startString) > -1) {
    // look for entity name
    const endIndex = line.substr(nameIndex + startStringLength).indexOf(stopString)
    return line.substr(nameIndex + startStringLength, (endIndex === -1) ? 10000 : endIndex)
  }
  return false
}

function getFirstNumberOfLine({line}) {
  const potentialYear = line.substr(0, line.indexOf('.'))
  if (potentialYear.match(/^-{0,1}\d+$/)) {
    return +potentialYear
  }
  return false
}

postItem = (year, data) => new Promise((resolve, reject) => {
  // noinspection JSAnnotator

  fetch(`${properties.chronasApiHost}/areas`, {
    method: 'POST',
    body: JSON.stringify({
      "year": year,
      "data": data
    }),
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6InVzZXJAa2V5c3RvbmVqcy5jb20iLCJ1c2VybmFtZSI6ImRpenp5LXdhc3RlIiwibGFzdFVwZGF0ZWQiOiIyMDE4LTAzLTAyVDE5OjE3OjI0LjU2M1oiLCJwcml2aWxlZ2UiOjEsImlhdCI6MTUyMDM5NzcwMX0.o4PX-DUixjEWOqUKyhL3F2ck4DJI6zKfmuc-0YvMERU'
    },
  })
    .then((response) => {
      if (response.status < 200 || response.status >= 300) {
        console.log('metadata failed', response.statusText)
        resolve()
      } else {
        console.log('metadata added')
        resolve()
      }
    })
    .catch((err) => {
      resolve()
    })

})

let prev_province, prev_year = -2500, prev_culture, prev_religion, prev_capital, prev_owner, prev_controller, prev_population

postYear = (yearToWrite) => new Promise((resolve, reject) => {
  let lastWritten = []
  // console.debug(fileName)
  //   const lineReader = new LineReader(folderDir + '/provinceHistory.csv', {encoding: 'utf-8', skipEmptyLines: false})
  //   lineReader.on('line', function (lineno, line) {
    lineReader.eachLine(folderDir + '/provinceHistory.csv', function(line) {
      const [province, year, culture, religion, capital, owner, controller, population] = line.split("\t");

      if (prev_province && prev_province !==  "Hälsingland" && (!lastWritten.includes(prev_province)) && (province !== prev_province)) {
        // TODO: handle this case and province substituting
        // if (prev_province == "Hälsingland") { console.debug(yearToWrite,'xxwe got Hälsingland', [prev_owner,prev_culture,prev_religion,prev_capital,prev_population]) }

        completedArea[prev_province.replace(/\./g, '')] = [prev_owner,prev_culture,prev_religion,prev_capital,prev_population]
        lastWritten.push(prev_province)
      }
      if (province !== prev_province) {
        // changing province, reset year

        prev_province = "na";
        prev_year = -2500;
        prev_culture = "na";
        prev_religion = "na";
        prev_capital = "na";
        prev_owner = "na";
        prev_controller = "na";
        prev_population = "na"

      }


      if ((!lastWritten.includes(prev_province)) && ((yearToWrite >= +prev_year && yearToWrite <= +year))) {
        // if (prev_province == "Hälsingland") { console.debug(yearToWrite,'0we got Hälsingland', [prev_owner,prev_culture,prev_religion,prev_capital,prev_population]) }
        //write// console.debug(prev_year, yearToWrite, year )
        completedArea[prev_province.replace(/\./g, '')] = [prev_owner,prev_culture,prev_religion,prev_capital,prev_population]

        // if (prev_province == "Hälsingland") { console.debug(yearToWrite,'we got Hälsingland', [prev_owner,prev_culture,prev_religion,prev_capital,prev_population]) }
        // console.debug(prev_province, prev_culture, prev_religion, prev_capital, prev_owner, prev_controller, prev_population, prev_year)
        lastWritten.push(prev_province)
      }

        [prev_province, prev_year, prev_culture, prev_religion, prev_capital, prev_owner, prev_controller, prev_population] = line.split("\t")
    }, function finished (err) {
      Object.keys(missing).forEach(mkey => completedArea[mkey] = completedArea[missing[mkey]] )
      postItem(yearToWrite, completedArea)
        .then(()=>{
          console.log(yearToWrite,"I'm done!!");
          resolve()
        })
    });
// }).then(function (err) {
//       if (err) throw err;
//       // console.debug(yearToWrite, completedArea)
//         postItem(yearToWrite, completedArea)
//         console.log("I'm done!!");
//     });
  //
  // lineReader.on('end', function () {
  //   // Post it
  //   // console.debug(yearToWrite, completedArea)
  //   // postItem(yearToWrite, completedArea)
  //
  // })
})

let years=[]

for (var i=1; i<2001; i++) {
  years.push(i)
}

years.reduce(
  (p, x) => p.then((_) => {
    return postYear(x)
  }),
  Promise.resolve()
)

/*
// Loop through all the files in the temp directory
fs.readdir(folderDir, function( err, files ) {
  if (err) {
    console.error("Could not list the directory.", err);
    process.exit(1);
  }

  files.reduce(
    (p, x) => p.then((_) => {
      return handleWarFile(x)
    }),
    Promise.resolve()
  )
})
*/
