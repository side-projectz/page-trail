import Head from 'next/head';
import React, { useEffect, useState } from 'react';

function formatTime(milliseconds) {
  let seconds = Math.floor(milliseconds / 1000);
  let minutes = Math.floor(seconds / 60);
  let hours = Math.floor(minutes / 60);

  seconds = seconds % 60;
  minutes = minutes % 60;

  // Padding each unit to ensure two digits
  hours = hours.toString().padStart(2, '0');
  minutes = minutes.toString().padStart(2, '0');
  seconds = seconds.toString().padStart(2, '0');

  return `${hours}:${minutes}:${seconds}`;
}

function convertArrayToObject(inputArray) {
  const resultObject = {};

  inputArray.forEach((item) => {
    const { domain, page, meta, lastVisited, openedAt, timeSpent, synced } =
      item;

    if (!resultObject[domain]) {
      resultObject[domain] = {
        domain: domain,
        pages: [],
      };
    }

    resultObject[domain].pages.push({
      domain: domain,
      page: page,
      meta: meta,
      lastVisited: lastVisited,
      openedAt: openedAt,
      timeSpent: timeSpent,
      synced: synced,
    });
  });

  return Object.values(resultObject);
}

const Listener = () => {
  const [sortedDomains, setSortedDomains] = useState([]);

  const syncData = () => {
    try {
      // console.log("syncData");
      chrome.runtime.sendMessage({ action: 'syncData' }, async (response) => {
        console.log('syncData success');
      });
    } catch (error) {
      console.log('syncData error', error);
    }
  };

  useEffect(() => {
    const loadData = async () => {
      const result = await chrome.storage.local.get('pageList');
      const pagesVisited = convertArrayToObject(result.pageList);

      console.log('pagesVisited', pagesVisited);

      const displayList = [];
      pagesVisited.forEach(({ domain, pages }) => {
        const time = pages.reduce((acc, page) => acc + page.timeSpent, 0);
        displayList.push({
          domainName: domain,
          time,
        });
      });

      console.log('displayList', displayList);

      setSortedDomains(displayList.sort((a, b) => b.time - a.time));
    };

    loadData();
  }, []);

  return (
    <>
      <Head>
        <title>Domain Time Tracker</title>
        <style>{`
          body {
            width: 400px !important;
            padding: 10px;
          }

          h1{
            margin-bottom: 16px !important;
          }
        `}</style>
      </Head>

      <div>
        <nav>
          <ul>
            <li>
              <h1>PageTrail</h1>
            </li>
          </ul>
          <ul>
            <li>
              <a href='#' role='button' onClick={syncData}>
                Sync now
              </a>
            </li>
          </ul>
        </nav>

        {/* <div>
          <label htmlFor='sortOptions'>Sort by:</label>
          <select
            id='sortOptions'
            onChange={(e) => setSortOption(e.target.value)}
          >
            <option value='topSpent'>Top Spent</option>
            <option value='recentSpent'>Recent Spent</option>
          </select>
        </div> */}

        <div>
          <table>
            <thead>
              <tr>
                <th scope='col'>Domain Name</th>
                <th scope='col'>Time Spent (hh:mm:ss)</th>
              </tr>
            </thead>
            <tbody>
              {sortedDomains.map(
                (domain, index) =>
                  index < 10 && (
                    <tr key={index}>
                      <td>{domain.domainName}</td>
                      <td>{formatTime(domain.time * 1000)}</td>
                    </tr>
                  )
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
};

export default Listener;
