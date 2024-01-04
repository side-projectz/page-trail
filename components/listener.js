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

const Listener = () => {
  const [sortOption, setSortOption] = useState('topSpent');
  const [sortedDomains, setSortedDomains] = useState([]);


  // const syncData = () => {
  //   try {
  //     // console.log("syncData");
  //     chrome.runtime.sendMessage({ action: 'syncData' }, async (response) => {
  //       console.log("syncData success");
  //     });
  //   } catch (error) {
  //     console.log("syncData error", error);
  //   }
  // }


  useEffect(() => {
    const loadData = async () => {
      const result = await chrome.storage.local.get('pageList');
      const pagesVisited = result.pageList || [];
      let domainTimeMap = {};

      // console.log("pagesVisited", pagesVisited);
      pagesVisited.forEach((domain) => {
        // console.log("domain", domain);
        const { pages, domain: name } = domain;
        let sumOfPages = 0;

        (pages).forEach((page) => {
          sumOfPages += page.timeSpent;
        });

        domain.timeSpent = sumOfPages;
        domainTimeMap[name] = domain.timeSpent;
      })

      // console.log("Time Spent by domain", domainTimeMap);

      // Convert map to array for sorting
      let sortedDomainsArray = Object.keys(domainTimeMap).map(
        (domainName) => {
          return { domainName, time: domainTimeMap[domainName] };
        }
      );

      // Sorting based on the selected option
      if (sortOption === 'topSpent') {
        sortedDomainsArray.sort((a, b) => b.time - a.time);
      } else if (sortOption === 'recentSpent') {
        // For recentSpent, you need to have a lastVisited timestamp at domain level
        // Assuming you have it, the sorting would be like:
        // sortedDomainsArray.sort((a, b) => b.lastVisited - a.lastVisited);
      }
      // console.log("sortedDomainsArray", sortedDomainsArray);
      setSortedDomains(sortedDomainsArray);
    }

    loadData();
  }, [sortOption]);

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
            <li><h1>PageTrail</h1></li>
          </ul>
          <ul>
            {/* <li><a href="#" role="button" onClick={syncData}>Sync now</a></li> */}
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
              {(sortedDomains).map(
                (domain, index) =>
                  index < 10 &&
                  (
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
