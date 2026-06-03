async function test() {
  try {
    const response = await fetch('http://localhost:3000/api/batch-parse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: "1) LA ESTAFA MAESTRA (1969)\n🖼️ Póster: https://image.tmdb.org/t/p/original/mId9K6UAnD79LgIsc67gJp6bC53.jpg\n🎬 Título Español: ⚠️ LA ESTAFA MAESTRA\n🏷️ Título Original: The Italian Job\n📅 Año: 1969\n⭐ Rating Global: 7.2/10 IMDb\n🎭 Género: Comedia, Acción, Crimen, Clásico\n⏱️ Duración: 99 minutos\n🌍 País: Reino Unido\n🔞 Clasificación: A\n✍️ Guion: Troy Kennedy Martin\n📺 Formato: DVD Original\n🎬 Dirección: Peter Collinson\n🎵 Banda Sonora: Quincy Jones\n📸 Fotografía: Douglas Slocombe\n🏢 Estudio: Paramount Pictures / Oakhurst Productions\n📚 Estante (Localización): 8.1\n👥 Elenco: Michael Caine, Noël Coward, Benny Hill, Raf Vallone, Tony Beckley, Rossano Brazzi, Margaret Blye\n📖 Argumento:\nSinopsis: Charlie Croker es un carismático e inteligente ladrón de cuello blanco que acaba de salir de prisión ordinaria. Inmediatamente decide heredar un suntuoso e histórico plan criminal táctica para ejecutar el robo del siglo en Turín: sustraer cuatro millones de dólares en lingotes de oro de una corporación automotriz china aprovechando el caos vial de la ciudad. Con el financiamiento clandestino de un refinado líder mafioso encarcelado, organiza a una peculiar banda para escapar en tres icónicos autos Mini Cooper por las carreteras de Italia.\nReseñas críticas: La prensa cinematográfica internacional la consagra como una de las mejores películas británicas de la historia, ampliamente alabada por su fino humor pop, la inmensa elegancia de Michael Caine y la suntuosa e impecable coreografía de su mítica persecución automovilística de culto.\nPremios históricos: Consiguió una importante nominación al Premio Globo de Oro en 1970 en la categoría de Mejor Película Extranjera de Lengua Inglesa, fijándose con una fuerza extraordinaria en la cultura pop mundial." })
    });
    const data = await response.text();
    console.log("STATUS:", response.status);
    console.log("RESPONSE:", data);
  } catch (err) {
    console.error(err);
  }
}
test();
